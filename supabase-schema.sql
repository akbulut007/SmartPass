create extension if not exists pgcrypto;

create table if not exists public.users_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  full_name text not null,
  uid text not null unique,
  role text not null default 'student' check (role in ('student', 'employee', 'admin', 'guest')),
  status text not null default 'active' check (status in ('active', 'blocked', 'expired')),
  created_at timestamptz not null default now()
);

create table if not exists public.approval_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  uid text not null,
  status text not null default 'waiting',
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  device text,
  approved_at timestamptz
);

create table if not exists public.access_logs (
  id uuid primary key default gen_random_uuid(),
  uid text,
  card_uid text,
  email text,
  result text not null,
  device text,
  location text,
  created_at timestamptz not null default now()
);

create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  request_type text not null default 'access_code',
  reason text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint access_requests_status_check check (status in ('pending', 'reviewed', 'approved', 'rejected'))
);

do $$
begin
  if to_regclass('public.cards') is not null then
    insert into public.users_cards (user_id, email, full_name, uid, role, status, created_at)
    select user_id, email, full_name, uid, role, status, created_at
    from public.cards
    on conflict (uid) do nothing;
  end if;
end $$;

alter table public.approval_sessions add column if not exists expires_at timestamptz;
alter table public.approval_sessions add column if not exists device text;
alter table public.approval_sessions add column if not exists approved_at timestamptz;
alter table public.approval_sessions drop constraint if exists approval_sessions_status_check;
update public.approval_sessions set status = 'rejected' where status in ('denied', 'DENIED');
update public.approval_sessions set status = lower(status);
alter table public.approval_sessions
add constraint approval_sessions_status_check check (status in ('waiting', 'approved', 'rejected', 'expired'));

alter table public.access_logs add column if not exists uid text;
alter table public.access_logs add column if not exists card_uid text;
alter table public.access_logs add column if not exists device text;
alter table public.access_logs add column if not exists location text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'access_logs' and column_name = 'card_uid'
  ) then
    update public.access_logs set uid = coalesce(uid, card_uid);
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'access_logs' and column_name = 'reason'
  ) then
    alter table public.access_logs alter column reason drop not null;
  end if;
end $$;

alter table public.access_logs drop constraint if exists access_logs_result_check;
update public.access_logs
set result = case
  when upper(result) = 'GRANTED' then 'approved'
  when upper(result) = 'DENIED' then 'rejected'
  when lower(result) = 'denied' then 'rejected'
  else lower(result)
end;
alter table public.access_logs
add constraint access_logs_result_check check (result in ('approved', 'rejected', 'expired'));

create index if not exists users_cards_uid_idx on public.users_cards(uid);
create index if not exists users_cards_user_id_idx on public.users_cards(user_id);
create index if not exists approval_sessions_user_id_idx on public.approval_sessions(user_id);
create index if not exists approval_sessions_status_idx on public.approval_sessions(status);
create index if not exists approval_sessions_created_at_idx on public.approval_sessions(created_at desc);
create index if not exists approval_sessions_expires_at_idx on public.approval_sessions(expires_at);
create index if not exists access_logs_created_at_idx on public.access_logs(created_at desc);
create index if not exists access_requests_created_at_idx on public.access_requests(created_at desc);
create index if not exists access_requests_email_idx on public.access_requests(email);
create index if not exists access_requests_status_idx on public.access_requests(status);

alter table public.users_cards enable row level security;
alter table public.approval_sessions enable row level security;
alter table public.access_logs enable row level security;
alter table public.access_requests enable row level security;

drop policy if exists "read digital identity registry" on public.users_cards;
create policy "read digital identity registry"
on public.users_cards for select
to anon, authenticated
using (true);

drop policy if exists "authenticated users can create identity" on public.users_cards;
create policy "authenticated users can create identity"
on public.users_cards for insert
to authenticated
with check (user_id = auth.uid() or user_id is null);

drop policy if exists "authenticated users can update identities" on public.users_cards;
create policy "authenticated users can update identities"
on public.users_cards for update
to authenticated
using (true)
with check (true);

drop policy if exists "authenticated users can delete identities" on public.users_cards;
create policy "authenticated users can delete identities"
on public.users_cards for delete
to authenticated
using (true);

drop policy if exists "authenticated users can create approval sessions" on public.approval_sessions;
create policy "authenticated users can create approval sessions"
on public.approval_sessions for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "approval sessions are readable by qr clients" on public.approval_sessions;
create policy "approval sessions are readable by qr clients"
on public.approval_sessions for select
to anon, authenticated
using (true);

drop policy if exists "qr clients can approve sessions" on public.approval_sessions;
create policy "qr clients can approve sessions"
on public.approval_sessions for update
to anon, authenticated
using (true)
with check (status in ('waiting', 'approved', 'rejected', 'expired'));

drop policy if exists "qr clients can create access logs" on public.access_logs;
create policy "qr clients can create access logs"
on public.access_logs for insert
to anon, authenticated
with check (true);

drop policy if exists "authenticated users can read access logs" on public.access_logs;
create policy "authenticated users can read access logs"
on public.access_logs for select
to authenticated
using (true);

drop policy if exists "anon users can create access requests" on public.access_requests;
create policy "anon users can create access requests"
on public.access_requests for insert
to anon, authenticated
with check (
  request_type = 'access_code'
  and status = 'pending'
);

drop policy if exists "admins can read access requests" on public.access_requests;
create policy "admins can read access requests"
on public.access_requests for select
to authenticated
using (
  lower(auth.jwt() ->> 'email') in ('yusufakbulut522@gmail.com', 'muhammed25yusuf@gmail.com')
);

drop policy if exists "admins can update access requests" on public.access_requests;
create policy "admins can update access requests"
on public.access_requests for update
to authenticated
using (
  lower(auth.jwt() ->> 'email') in ('yusufakbulut522@gmail.com', 'muhammed25yusuf@gmail.com')
)
with check (
  lower(auth.jwt() ->> 'email') in ('yusufakbulut522@gmail.com', 'muhammed25yusuf@gmail.com')
  and status in ('pending', 'reviewed', 'approved', 'rejected')
);
