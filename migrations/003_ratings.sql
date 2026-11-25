-- =============================================
-- Migration 003: Barber ratings
-- =============================================

-- 1. Add rating columns to profiles (for barbers)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS rating_avg   numeric(3,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_count int          DEFAULT 0;

-- 2. Ratings history table
CREATE TABLE IF NOT EXISTS public.barber_ratings (
  id          uuid primary key default gen_random_uuid(),
  barber_id   uuid NOT NULL references public.profiles(id) on delete cascade,
  client_id   uuid NOT NULL references public.profiles(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  rating      numeric(3,2) NOT NULL CHECK (rating >= 0 AND rating <= 5),
  created_at  timestamptz default now(),
  -- one rating per client per appointment
  UNIQUE(client_id, appointment_id)
);

-- RLS
ALTER TABLE public.barber_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view ratings"
  ON public.barber_ratings FOR SELECT USING (true);

CREATE POLICY "Clients can insert own rating"
  ON public.barber_ratings FOR INSERT
  WITH CHECK (auth.uid() = client_id);

-- 3. Function: recalculate avg + count after any insert/update/delete on ratings
CREATE OR REPLACE FUNCTION public.refresh_barber_rating()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  target_barber_id uuid;
  new_avg  numeric(3,2);
  new_count int;
BEGIN
  -- Determine which barber to refresh
  IF TG_OP = 'DELETE' THEN
    target_barber_id := OLD.barber_id;
  ELSE
    target_barber_id := NEW.barber_id;
  END IF;

  SELECT
    COALESCE(ROUND(AVG(rating)::numeric, 2), 0),
    COUNT(*)
  INTO new_avg, new_count
  FROM public.barber_ratings
  WHERE barber_id = target_barber_id;

  UPDATE public.profiles
  SET rating_avg   = new_avg,
      rating_count = new_count
  WHERE id = target_barber_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS on_rating_change ON public.barber_ratings;
CREATE TRIGGER on_rating_change
  AFTER INSERT OR UPDATE OR DELETE ON public.barber_ratings
  FOR EACH ROW EXECUTE FUNCTION public.refresh_barber_rating();
