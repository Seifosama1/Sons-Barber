-- Migration 011: Transactions & Revenue tables

-- 1. Transactions — every completed cut
CREATE TABLE IF NOT EXISTS public.transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barber_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  client_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL, -- null for walk-ins
  service_id      uuid REFERENCES public.services(id) ON DELETE SET NULL,
  service_name    text NOT NULL,                -- snapshot at time of checkout
  price_charged   numeric(10,2) NOT NULL,       -- final price after discount
  original_price  numeric(10,2) NOT NULL,       -- price before discount
  discount_pct    numeric(5,2) DEFAULT 0,
  tendered        numeric(10,2),                -- cash given by client
  change_amount   numeric(10,2),                -- change returned
  walk_in_phone   text,                         -- for non-app walk-ins
  walk_in_name    text,                         -- optional name for walk-ins
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage transactions"
  ON public.transactions FOR ALL
  USING (public.get_my_role() = 'admin');

CREATE POLICY "Clients view own transactions"
  ON public.transactions FOR SELECT
  USING (auth.uid() = client_id);

CREATE POLICY "Barbers view own transactions"
  ON public.transactions FOR SELECT
  USING (auth.uid() = barber_id);

-- 2. Add walk-in fields to waitlist (for IRL clients added by admin)
ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS walk_in_phone text,
  ADD COLUMN IF NOT EXISTS walk_in_name  text,
  ADD COLUMN IF NOT EXISTS added_by_admin boolean DEFAULT false;

-- 3. Enable realtime on transactions
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;

-- 4. Index for fast barber/client lookups
CREATE INDEX IF NOT EXISTS idx_transactions_barber  ON public.transactions(barber_id);
CREATE INDEX IF NOT EXISTS idx_transactions_client  ON public.transactions(client_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON public.transactions(created_at DESC);
