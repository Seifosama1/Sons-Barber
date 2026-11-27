-- Migration 024: Create user_device_tokens table for Native Push Notifications (FCM)
CREATE TABLE IF NOT EXISTS public.user_device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  fcm_token TEXT NOT NULL UNIQUE,
  device_type TEXT DEFAULT 'android',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for speedy queries when targeting a user
CREATE INDEX IF NOT EXISTS idx_user_device_tokens_user_id ON public.user_device_tokens(user_id);

-- Enable Row Level Security
ALTER TABLE public.user_device_tokens ENABLE ROW LEVEL SECURITY;

-- Allow users to manage their own device tokens
CREATE POLICY "Users can insert their own device tokens"
  ON public.user_device_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own device tokens"
  ON public.user_device_tokens FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can read their own device tokens"
  ON public.user_device_tokens FOR SELECT
  USING (auth.uid() = user_id);

-- Allow service role full access for backend push dispatcher
CREATE POLICY "Service role full access on device tokens"
  ON public.user_device_tokens FOR ALL
  USING (true);
