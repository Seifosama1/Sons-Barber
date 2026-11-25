-- Migration 005: Add discount column to services + enable realtime
ALTER TABLE public.services 
  ADD COLUMN IF NOT EXISTS discount_pct numeric(5,2) DEFAULT 0 
    CHECK (discount_pct >= 0 AND discount_pct <= 100);

-- Enable realtime on services
ALTER PUBLICATION supabase_realtime ADD TABLE public.services;
