-- Migration 013: Fix loyalty RLS + backfill existing data

-- 1. Allow admins to update any profile (needed for loyalty increments)
DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
CREATE POLICY "Admins can update profiles"
  ON public.profiles FOR UPDATE
  USING (public.get_my_role() = 'admin');

-- 2. Backfill total_cuts from transactions table for existing clients
UPDATE public.profiles p
SET total_cuts   = t.cut_count,
    loyalty_cuts = t.cut_count % 10
FROM (
  SELECT client_id, COUNT(*) AS cut_count
  FROM public.transactions
  WHERE client_id IS NOT NULL
  GROUP BY client_id
) t
WHERE p.id = t.client_id;

-- 3. Mark confirmed appointments as completed if a transaction exists for that client+barber
UPDATE public.appointments a
SET status = 'completed'
WHERE a.status = 'confirmed'
  AND EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.client_id = a.client_id
      AND t.barber_id = a.barber_id
  );
