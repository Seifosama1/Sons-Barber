-- Migration 021: Add barber profile extensions (bio, social links, avatar_url, media_type in portfolio)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS instagram_url text,
  ADD COLUMN IF NOT EXISTS tiktok_url text,
  ADD COLUMN IF NOT EXISTS whatsapp_phone text;

-- Add media_type to portfolio_photos to support video posts as well as photos
ALTER TABLE public.portfolio_photos
  ADD COLUMN IF NOT EXISTS media_type text DEFAULT 'image' CHECK (media_type IN ('image', 'video'));

-- Create storage bucket for barber media if not exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'barber-media',
  'barber-media',
  true,
  52428800, -- 50MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm']
) ON CONFLICT (id) DO NOTHING;

-- Public read policy for barber-media
DROP POLICY IF EXISTS "Public view barber media" ON storage.objects;
CREATE POLICY "Public view barber media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'barber-media');

-- Authenticated upload policy for barber-media
DROP POLICY IF EXISTS "Barbers can upload media" ON storage.objects;
CREATE POLICY "Barbers can upload media"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'barber-media' AND auth.role() = 'authenticated');

-- Barbers can delete own uploads
DROP POLICY IF EXISTS "Barbers can delete media" ON storage.objects;
CREATE POLICY "Barbers can delete media"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'barber-media' AND auth.role() = 'authenticated');
