-- Migration 018: Allow one rating per session (per notification) instead of per barber
-- Each checkout generates a new rating_request notification.
-- The rating is linked to that notification, so the same client can rate multiple times
-- (once per session) but each notification can only be responded to once.

-- 1. Drop the unique constraint that limits to one rating per client per barber
ALTER TABLE public.barber_ratings
  DROP CONSTRAINT IF EXISTS barber_ratings_client_barber_key;

-- 2. Add notification_id column to track which notification triggered this rating
ALTER TABLE public.barber_ratings
  ADD COLUMN IF NOT EXISTS notification_id uuid REFERENCES public.notifications(id) ON DELETE SET NULL;

-- 3. Add unique constraint: one rating per notification
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'barber_ratings_notification_key'
  ) THEN
    ALTER TABLE public.barber_ratings
      ADD CONSTRAINT barber_ratings_notification_key UNIQUE (notification_id);
  END IF;
END $$;

-- 4. Recalculate ratings for existing barbers (avg stays the same, just unlocks future multi-ratings)
-- No data change needed — existing rows are unaffected.
