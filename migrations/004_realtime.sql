-- =============================================
-- Migration 004: Enable Realtime on all tables
-- =============================================

-- Add tables to the realtime publication
-- This makes Supabase stream all INSERT/UPDATE/DELETE events via WebSocket

ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shop_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.barber_ratings;
