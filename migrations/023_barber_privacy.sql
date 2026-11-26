-- Migration 023: Add hide_queue_count privacy column to profiles for barbers
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS hide_queue_count boolean DEFAULT false;
