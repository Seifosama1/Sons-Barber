-- Migration 020: Allow walk-in clients in waitlist (client_id NULL)
-- When an admin adds a walk-in client (guest with no app account),
-- client_id will be NULL, and walk_in_phone / walk_in_name will store their details.

ALTER TABLE public.waitlist
  ALTER COLUMN client_id DROP NOT NULL;
