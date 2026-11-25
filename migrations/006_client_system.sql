-- =============================================
-- Migration 006: Full client system
-- =============================================

-- 1. Add client_code + loyalty fields to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS client_code    char(6)   UNIQUE,
  ADD COLUMN IF NOT EXISTS total_cuts     int       DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loyalty_cuts   int       DEFAULT 0;  -- resets after reward

-- 2. Auto-generate 6-digit client code on signup
CREATE OR REPLACE FUNCTION public.generate_client_code()
RETURNS char(6) LANGUAGE plpgsql AS $$
DECLARE
  code char(6);
  exists bool;
BEGIN
  LOOP
    code := LPAD(FLOOR(RANDOM() * 1000000)::text, 6, '0');
    SELECT COUNT(*) > 0 INTO exists FROM public.profiles WHERE client_code = code;
    EXIT WHEN NOT exists;
  END LOOP;
  RETURN code;
END;
$$;

-- Update trigger to include client_code for client/barber roles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_role text;
  v_code char(6);
BEGIN
  v_role := COALESCE(new.raw_user_meta_data->>'role', 'client');
  
  -- Generate code for clients
  IF v_role = 'client' THEN
    v_code := public.generate_client_code();
  END IF;

  INSERT INTO public.profiles (id, name, phone, birthday, role, client_code)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'name', 'مستخدم'),
    COALESCE(new.raw_user_meta_data->>'phone', ''),
    NULLIF(new.raw_user_meta_data->>'birthday', '')::date,
    v_role,
    v_code
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

-- Backfill existing clients with codes
UPDATE public.profiles
SET client_code = public.generate_client_code()
WHERE role = 'client' AND client_code IS NULL;

-- 3. Add deposit_amount to services
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS deposit_amount numeric(10,2) DEFAULT 50;

-- 4. Add barber active status (for live waitlist)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active  boolean DEFAULT true,  -- barber on/off shift
  ADD COLUMN IF NOT EXISTS on_seat_client_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
  -- on_seat_client_id: which client is currently getting a haircut

-- 5. Live waitlist table
CREATE TABLE IF NOT EXISTS public.waitlist (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barber_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at   timestamptz DEFAULT now(),
  status      text DEFAULT 'waiting' CHECK (status IN ('waiting','in_service','done','left')),
  notified_at timestamptz,
  UNIQUE(barber_id, client_id, status)  -- prevent duplicate active entries
);

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view own waitlist entry"
  ON public.waitlist FOR SELECT USING (auth.uid() = client_id);

CREATE POLICY "Clients can join waitlist"
  ON public.waitlist FOR INSERT
  WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Clients can leave waitlist"
  ON public.waitlist FOR UPDATE USING (auth.uid() = client_id);

CREATE POLICY "Admins and barbers can manage waitlist"
  ON public.waitlist FOR ALL
  USING (public.get_my_role() IN ('admin','barber'));

CREATE POLICY "Anyone can view waitlist counts"
  ON public.waitlist FOR SELECT USING (true);

-- 6. Notifications table (already exists but add more fields)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS target_user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS type           text DEFAULT 'general'
    CHECK (type IN ('general','booking_approved','booking_rejected','next_in_queue','offer','system')),
  ADD COLUMN IF NOT EXISTS is_read        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS action_url     text;

-- 7. Portfolio photos table (for barber profiles)
CREATE TABLE IF NOT EXISTS public.portfolio_photos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barber_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  photo_url   text NOT NULL,
  caption     text,
  likes_count int DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.portfolio_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view portfolio"
  ON public.portfolio_photos FOR SELECT USING (true);

CREATE POLICY "Barbers manage own portfolio"
  ON public.portfolio_photos FOR ALL
  USING (auth.uid() = barber_id);

-- 8. Photo likes
CREATE TABLE IF NOT EXISTS public.photo_likes (
  photo_id    uuid REFERENCES public.portfolio_photos(id) ON DELETE CASCADE,
  client_id   uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  PRIMARY KEY (photo_id, client_id)
);

ALTER TABLE public.photo_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view likes"
  ON public.photo_likes FOR SELECT USING (true);

CREATE POLICY "Clients can like"
  ON public.photo_likes FOR INSERT
  WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Clients can unlike"
  ON public.photo_likes FOR DELETE
  USING (auth.uid() = client_id);

-- Trigger to update likes_count
CREATE OR REPLACE FUNCTION public.refresh_photo_likes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE target_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN target_id := OLD.photo_id;
  ELSE target_id := NEW.photo_id; END IF;
  UPDATE public.portfolio_photos
  SET likes_count = (SELECT COUNT(*) FROM public.photo_likes WHERE photo_id = target_id)
  WHERE id = target_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS on_photo_like ON public.photo_likes;
CREATE TRIGGER on_photo_like
  AFTER INSERT OR DELETE ON public.photo_likes
  FOR EACH ROW EXECUTE FUNCTION public.refresh_photo_likes();

-- 9. Enable realtime on new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.waitlist;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.portfolio_photos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.photo_likes;
