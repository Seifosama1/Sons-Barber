-- Migration 024: Enable pg_net extension and trigger edge function on waitlist insert
-- Run this in Supabase SQL Editor

-- 1. Enable the pg_net extension (allows HTTP calls from DB triggers)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Create the trigger function that calls the edge function
CREATE OR REPLACE FUNCTION public.notify_barber_on_queue_join()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Only fire for new 'waiting' entries (client joining queue)
  IF NEW.status = 'waiting' THEN
    PERFORM net.http_post(
      url     := 'https://dlbeywpyjdhynflmqvgb.supabase.co/functions/v1/notify-barber-queue',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
      ),
      body    := jsonb_build_object(
        'barber_id',    NEW.barber_id::text,
        'client_id',    NEW.client_id::text,
        'entry_id',     NEW.id::text,
        'walk_in_name', NEW.walk_in_name
      )::text
    );
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Attach trigger to waitlist table
DROP TRIGGER IF EXISTS on_waitlist_join ON public.waitlist;
CREATE TRIGGER on_waitlist_join
  AFTER INSERT ON public.waitlist
  FOR EACH ROW EXECUTE FUNCTION public.notify_barber_on_queue_join();
