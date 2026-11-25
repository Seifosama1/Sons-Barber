-- Migration 015: Reset loyalty to correct count (remove test transactions)
-- Keep only the most recent transaction per client (the real one)
-- Then recalculate loyalty

-- 1. Delete duplicate test transactions — keep only the latest one per client
DELETE FROM public.transactions
WHERE id NOT IN (
  SELECT DISTINCT ON (client_id) id
  FROM public.transactions
  WHERE client_id IS NOT NULL
  ORDER BY client_id, created_at DESC
);

-- 2. Recalculate loyalty from the cleaned transactions
UPDATE public.profiles p
SET total_cuts   = COALESCE(t.cut_count, 0),
    loyalty_cuts = COALESCE(t.cut_count, 0) % 10
FROM (
  SELECT client_id, COUNT(*) AS cut_count
  FROM public.transactions
  WHERE client_id IS NOT NULL
  GROUP BY client_id
) t
WHERE p.id = t.client_id;

-- 3. Zero out clients with no transactions
UPDATE public.profiles
SET total_cuts = 0, loyalty_cuts = 0
WHERE role = 'client'
  AND id NOT IN (
    SELECT DISTINCT client_id FROM public.transactions WHERE client_id IS NOT NULL
  );
