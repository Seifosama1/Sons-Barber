-- Migration 016: Fix barber_ratings upsert constraint + RLS

-- 1. The unique constraint needs to be on (client_id, barber_id) without appointment_id
--    so clients can rate a barber once total (not per appointment)
DO $$
BEGIN
  -- Drop old appointment-based unique constraint if exists
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'barber_ratings_client_id_appointment_id_key') THEN
    ALTER TABLE public.barber_ratings DROP CONSTRAINT barber_ratings_client_id_appointment_id_key;
  END IF;

  -- Add the correct unique constraint
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'barber_ratings_client_barber_key') THEN
    ALTER TABLE public.barber_ratings ADD CONSTRAINT barber_ratings_client_barber_key UNIQUE (client_id, barber_id);
  END IF;
END $$;

-- 2. Make sure RLS policies are correct
-- Clients can insert their own ratings
DROP POLICY IF EXISTS "Clients can insert own rating" ON public.barber_ratings;
CREATE POLICY "Clients can insert own rating"
  ON public.barber_ratings FOR INSERT
  WITH CHECK (auth.uid() = client_id);

-- Clients can update their own ratings (needed for upsert)
DROP POLICY IF EXISTS "Clients can update own rating" ON public.barber_ratings;
CREATE POLICY "Clients can update own rating"
  ON public.barber_ratings FOR UPDATE
  USING (auth.uid() = client_id);

-- Anyone can view ratings
DROP POLICY IF EXISTS "Anyone can view ratings" ON public.barber_ratings;
CREATE POLICY "Anyone can view ratings"
  ON public.barber_ratings FOR SELECT
  USING (true);
