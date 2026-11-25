-- Migration 023: Notification preferences per user
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notif_session_rating boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_offers         boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS notif_queue          boolean DEFAULT true;
