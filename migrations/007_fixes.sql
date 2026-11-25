-- =============================================
-- Migration 007: Consolidated fixes
-- Addresses: missing get_my_role() definition,
--            role constraint missing 'barber',
--            missing shop_settings table + storage bucket
-- =============================================

-- 1. get_my_role() helper — used by RLS policies in migrations 002 & 006
--    (exists in live DB but was never captured in a migration file)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- 2. Fix profiles role check constraint to include 'barber'
--    Base schema only allowed ('admin','client'); barbers are stored as
--    profiles with role='barber' so the constraint must be widened.
DO $$
BEGIN
  -- Drop any existing role check constraint on profiles
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%role%'
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'barber', 'client'));

-- 3. shop_settings table (from migration 002 — was never applied)
CREATE TABLE IF NOT EXISTS public.shop_settings (
  id            int primary key default 1,
  is_open       boolean default true,
  open_time     time default '09:00',
  close_time    time default '22:00',
  updated_at    timestamptz default now(),
  updated_by    uuid references public.profiles(id),
  CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO public.shop_settings (id, is_open, open_time, close_time)
VALUES (1, true, '09:00', '22:00')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read shop settings" ON public.shop_settings;
CREATE POLICY "Anyone can read shop settings"
  ON public.shop_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can update shop settings" ON public.shop_settings;
CREATE POLICY "Admins can update shop settings"
  ON public.shop_settings FOR UPDATE
  USING (public.get_my_role() = 'admin');

-- 4. Storage bucket for instapay receipts (from migration 002)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'instapay-receipts',
  'instapay-receipts',
  false,
  5242880, -- 5MB
  ARRAY['image/jpeg','image/png','image/webp','image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
DROP POLICY IF EXISTS "Clients can upload receipts" ON storage.objects;
CREATE POLICY "Clients can upload receipts"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'instapay-receipts' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Admins can view receipts" ON storage.objects;
CREATE POLICY "Admins can view receipts"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'instapay-receipts' AND
    public.get_my_role() = 'admin'
  );

DROP POLICY IF EXISTS "Clients can view own receipts" ON storage.objects;
CREATE POLICY "Clients can view own receipts"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'instapay-receipts' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- 5. Add instapay/deposit columns to appointments (from migration 002)
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS instapay_image_url  text,
  ADD COLUMN IF NOT EXISTS deposit_amount      numeric(10,2) DEFAULT 50,
  ADD COLUMN IF NOT EXISTS reviewed_at         timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by         uuid references public.profiles(id);

-- 6. Enable realtime on shop_settings
ALTER PUBLICATION supabase_realtime ADD TABLE public.shop_settings;
