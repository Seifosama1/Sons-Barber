-- =============================================
-- Sons Barber — Supabase Schema
-- Run this in: Supabase Dashboard > SQL Editor
-- =============================================

-- 1. PROFILES
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  phone       text not null unique,
  birthday    date,
  role        text not null default 'client' check (role in ('admin', 'barber', 'client')),
  avatar_url  text,
  created_at  timestamptz default now()
);

-- Auto-create profile row when a user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, name, phone, birthday, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'مستخدم'),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    nullif(new.raw_user_meta_data->>'birthday', '')::date,
    coalesce(new.raw_user_meta_data->>'role', 'client')
  )
  on conflict (phone) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. BARBERS
create table if not exists public.barbers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text,
  specialty   text,
  bio         text,
  avatar_url  text,
  is_active   boolean default true,
  created_at  timestamptz default now()
);

-- 3. SERVICES
create table if not exists public.services (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  price       numeric(10,2) not null,
  duration    int not null,
  is_active   boolean default true,
  created_at  timestamptz default now()
);

-- 4. APPOINTMENTS
create table if not exists public.appointments (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid references public.profiles(id) on delete cascade,
  barber_id     uuid references public.profiles(id) on delete set null,
  service_id    uuid references public.services(id) on delete set null,
  scheduled_at  timestamptz not null,
  status        text default 'pending' check (status in ('pending','confirmed','completed','cancelled','rejected')),
  notes         text,
  created_at    timestamptz default now()
);

-- 5. NOTIFICATIONS
create table if not exists public.notifications (
  id        uuid primary key default gen_random_uuid(),
  title     text not null,
  body      text not null,
  sent_at   timestamptz default now(),
  sent_by   uuid references public.profiles(id)
);

-- Helper: return the role of the currently authenticated user
create or replace function public.get_my_role()
returns text language sql security definer stable as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ── Row Level Security ──

alter table public.profiles enable row level security;
alter table public.barbers enable row level security;
alter table public.services enable row level security;
alter table public.appointments enable row level security;
alter table public.notifications enable row level security;

-- ── PROFILES policies ──
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Admins can view all profiles"
  on public.profiles for select
  using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
  );

-- ── BARBERS policies ──
create policy "Anyone can view barbers"
  on public.barbers for select
  using (true);

create policy "Admins can insert barbers"
  on public.barbers for insert
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "Admins can update barbers"
  on public.barbers for update
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "Admins can delete barbers"
  on public.barbers for delete
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ── SERVICES policies ──
create policy "Anyone can view services"
  on public.services for select
  using (true);

create policy "Admins can insert services"
  on public.services for insert
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "Admins can update services"
  on public.services for update
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "Admins can delete services"
  on public.services for delete
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ── APPOINTMENTS policies ──
create policy "Clients view own appointments"
  on public.appointments for select
  using (auth.uid() = client_id);

create policy "Clients can create appointments"
  on public.appointments for insert
  with check (auth.uid() = client_id);

create policy "Admins view all appointments"
  on public.appointments for select
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "Admins can update appointments"
  on public.appointments for update
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "Admins can delete appointments"
  on public.appointments for delete
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ── NOTIFICATIONS policies ──
create policy "Anyone can read notifications"
  on public.notifications for select
  using (true);

create policy "Admins can send notifications"
  on public.notifications for insert
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
