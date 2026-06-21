-- Run this in Supabase: Project -> SQL Editor -> New Query -> paste all -> Run
-- This version uses Supabase's built-in Auth (auth.users) for login/signup/OTP/password-reset.
-- This "profiles" table just stores app-specific data (plan, usage) linked to that Auth user.

create table if not exists profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text unique not null,
  name text not null,
  plan text default 'free',
  questions_used int default 0,
  images_used int default 0,
  created_at timestamp default now()
);

create table if not exists chat_history (
  id uuid default gen_random_uuid() primary key,
  user_email text references profiles(email) on delete cascade,
  advisor text,
  title text,
  messages jsonb,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table if not exists payments (
  id uuid default gen_random_uuid() primary key,
  user_email text,
  plan text,
  dodo_payment_id text unique,
  status text,
  created_at timestamp default now()
);

alter table profiles enable row level security;
alter table chat_history enable row level security;
alter table payments enable row level security;

-- Our backend (api/*.js) uses the publishable key, called only server-side
-- from our own serverless functions (never directly from the browser), so
-- these permissive policies are fine here.
drop policy if exists "allow_all_profiles" on profiles;
create policy "allow_all_profiles" on profiles for all using (true) with check (true);

drop policy if exists "allow_all_history" on chat_history;
create policy "allow_all_history" on chat_history for all using (true) with check (true);

drop policy if exists "allow_all_payments" on payments;
create policy "allow_all_payments" on payments for all using (true) with check (true);

-- IMPORTANT: also go to Supabase Dashboard -> Authentication -> Providers -> Email
-- and make sure "Enable Email OTP" / "Enable Email provider" is turned ON.
-- This is what lets us send OTP codes and password reset emails for free.
