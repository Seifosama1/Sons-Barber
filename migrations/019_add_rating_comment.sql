-- Migration 019: Add comment column to barber_ratings
ALTER TABLE public.barber_ratings
  ADD COLUMN IF NOT EXISTS comment text;

-- Ensure clients can insert and update their comment
-- (Existing policies on barber_ratings already cover FOR INSERT and FOR UPDATE with auth.uid() = client_id)
