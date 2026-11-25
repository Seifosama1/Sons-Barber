-- Migration 010: Add 'rejected' to appointments status check constraint
-- The original constraint only allowed: pending, confirmed, completed, cancelled
-- 'rejected' was used in the app but never added to the constraint, causing silent failures.

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_status_check;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'rejected'));
