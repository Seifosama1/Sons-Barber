-- Migration 025: Fix waitlist RLS so clients can join ANY barber's queue
-- and barbers/admin can see ALL entries for their barber_id

-- Drop the old restrictive client insert policy
DROP POLICY IF EXISTS "Clients can join waitlist" ON public.waitlist;
DROP POLICY IF EXISTS "Clients can leave waitlist" ON public.waitlist;
DROP POLICY IF EXISTS "Clients can view own waitlist entry" ON public.waitlist;
DROP POLICY IF EXISTS "Admins and barbers can manage waitlist" ON public.waitlist;
DROP POLICY IF EXISTS "Anyone can view waitlist counts" ON public.waitlist;

-- Allow any authenticated client to join any barber's queue
CREATE POLICY "Clients can join any barber queue"
  ON public.waitlist FOR INSERT
  WITH CHECK (
    auth.uid() = client_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = barber_id AND role = 'barber'
    )
  );

-- Clients can update (leave) their own entries
CREATE POLICY "Clients can leave waitlist"
  ON public.waitlist FOR UPDATE
  USING (auth.uid() = client_id);

-- Everyone can read all waitlist entries (needed for queue counts and position display)
CREATE POLICY "Anyone can view waitlist"
  ON public.waitlist FOR SELECT
  USING (true);

-- Barbers and admins can manage all entries (insert walk-ins, update status, delete)
CREATE POLICY "Barbers and admins manage waitlist"
  ON public.waitlist FOR ALL
  USING (public.get_my_role() IN ('admin', 'barber'))
  WITH CHECK (public.get_my_role() IN ('admin', 'barber'));
