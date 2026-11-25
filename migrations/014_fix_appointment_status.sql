-- Migration 014: Revert appointments incorrectly marked completed
-- Appointments should stay 'confirmed' — they represent bookings.
-- Only the transactions table tracks actual paid sessions (loyalty source).

UPDATE public.appointments
SET status = 'confirmed'
WHERE status = 'completed'
  AND EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.client_id = appointments.client_id
      AND t.barber_id = appointments.barber_id
  );
