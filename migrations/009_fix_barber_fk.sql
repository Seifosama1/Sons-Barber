-- Migration 009: Fix appointments.barber_id FK
-- The base schema pointed barber_id at the unused `barbers` table.
-- All barbers live in `profiles` (role='barber'), so re-target the FK there.

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_barber_id_fkey;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_barber_id_fkey
  FOREIGN KEY (barber_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
