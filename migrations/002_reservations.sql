-- =============================================
-- Migration 002: Reservation requests + shop settings
-- Run in: Supabase Dashboard > SQL Editor
-- =============================================

-- 1. Add instapay & deposit fields to appointments
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS instapay_image_url  text,
  ADD COLUMN IF NOT EXISTS deposit_amount      numeric(10,2) DEFAULT 50,
  ADD COLUMN IF NOT EXISTS reviewed_at         timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by         uuid references public.profiles(id);

-- Change status default to 'pending' (already is, but be explicit)
-- Status values: pending | confirmed | rejected | completed | cancelled

-- 2. Shop settings table
CREATE TABLE IF NOT EXISTS public.shop_settings (
  id            int primary key default 1,
  is_open       boolean default true,
  open_time     time default '09:00',
  close_time    time default '22:00',
  updated_at    timestamptz default now(),
  updated_by    uuid references public.profiles(id),
  CONSTRAINT single_row CHECK (id = 1)
);

-- Insert default row if not exists
INSERT INTO public.shop_settings (id, is_open, open_time, close_time)
VALUES (1, true, '09:00', '22:00')
ON CONFLICT (id) DO NOTHING;

-- RLS for shop_settings
ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read shop settings"
  ON public.shop_settings FOR SELECT USING (true);

CREATE POLICY "Admins can update shop settings"
  ON public.shop_settings FOR UPDATE
  USING (public.get_my_role() = 'admin');

-- 3. Storage bucket for instapay receipts
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'instapay-receipts',
  'instapay-receipts',
  false,
  5242880, -- 5MB
  ARRAY['image/jpeg','image/png','image/webp','image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: clients can upload their own, admins can view all
CREATE POLICY "Clients can upload receipts"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'instapay-receipts' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Admins can view receipts"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'instapay-receipts' AND
    public.get_my_role() = 'admin'
  );

CREATE POLICY "Clients can view own receipts"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'instapay-receipts' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- 4. Update appointments RLS so admins can update status
DROP POLICY IF EXISTS "Admins can update appointments" ON public.appointments;
CREATE POLICY "Admins can update appointments"
  ON public.appointments FOR UPDATE
  USING (public.get_my_role() = 'admin');
