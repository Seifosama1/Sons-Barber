-- Migration 022: Push Subscriptions & Native Notification Dispatch
-- Adds storage for web push / native device push tokens (FCM / Capacitor / Web Push)
-- and functions to manage notification tokens.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  device_type text DEFAULT 'android', -- 'android', 'ios', 'web'
  token       text NOT NULL,          -- FCM registration token or Web Push endpoint
  subscription_json jsonb,            -- Full subscription object for Web Push
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  CONSTRAINT push_subscriptions_user_token_key UNIQUE (user_id, token)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users manage own push subscriptions"
  ON public.push_subscriptions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Admins can view push subscriptions"
  ON public.push_subscriptions FOR SELECT
  USING (public.get_my_role() = 'admin');

-- Index for speedy lookup by user
CREATE INDEX IF NOT EXISTS idx_push_subs_user ON public.push_subscriptions(user_id);

-- Realtime publication for notifications table (ensures client-side triggers receive all inserts)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
