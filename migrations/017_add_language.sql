-- Migration 017: Add language preference to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS lang text DEFAULT 'ar' CHECK (lang IN ('ar', 'en'));
