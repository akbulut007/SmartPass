create extension if not exists pgcrypto;

create or replace function public.is_smartpass_admin()
returns boolean
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'yusufakbulut522@gmail.com',
    'muhammed25yusuf@gmail.com'
  );
$$;

create or replace function public.generate_smartpass_uid()
returns text
language plpgsql
as $$
declare
  generated_uid text;
begin
  loop
    generated_uid := 'NFC-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8));
    exit when not exists (select 1 from public.cards where uid = generated_uid);
  end loop;

  return generated_uid;
end;
$$;

create or replace function public.generate_smartpass_access_code()
returns text
language sql
as $$
  select lpad((floor(random() * 10000))::int::text, 4, '0');
$$;

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  uid text not null unique,
  role text not null default 'student',
  status text not null default 'active',
  access_code text,
  created_at timestamptz not null default now()
);

create table if not exists public.approval_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  uid text not null,
  status text not null default 'waiting',
  device text,
  expires_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.access_logs (
  id uuid primary key default gen_random_uuid(),
  uid text,
  card_uid text,
  email text,
  result text,
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
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  subject text not null,
  message text not null,
  related_request_id uuid,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.cards add column if not exists user_id uuid unique references auth.users(id) on delete cascade;
alter table public.cards add column if not exists email text;
alter table public.cards add column if not exists full_name text;
alter table public.cards add column if not exists uid text;
alter table public.cards add column if not exists role text not null default 'student';
alter table public.cards add column if not exists status text not null default 'active';
alter table public.cards add column if not exists access_code text;
alter table public.cards add column if not exists created_at timestamptz not null default now();

alter table public.approval_sessions add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.approval_sessions add column if not exists uid text;
alter table public.approval_sessions add column if not exists status text not null default 'waiting';
alter table public.approval_sessions add column if not exists device text;
alter table public.approval_sessions add column if not exists expires_at timestamptz;
alter table public.approval_sessions add column if not exists approved_at timestamptz;
alter table public.approval_sessions add column if not exists created_at timestamptz not null default now();

alter table public.access_logs add column if not exists uid text;
alter table public.access_logs add column if not exists card_uid text;
alter table public.access_logs add column if not exists email text;
alter table public.access_logs add column if not exists result text;
alter table public.access_logs add column if not exists device text;
alter table public.access_logs add column if not exists location text;
alter table public.access_logs add column if not exists created_at timestamptz not null default now();

alter table public.access_requests add column if not exists full_name text;
alter table public.access_requests add column if not exists email text;
alter table public.access_requests add column if not exists request_type text not null default 'access_code';
alter table public.access_requests add column if not exists reason text;
alter table public.access_requests add column if not exists status text not null default 'pending';
alter table public.access_requests add column if not exists created_at timestamptz not null default now();

alter table public.messages add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.messages add column if not exists email text;
alter table public.messages add column if not exists subject text;
alter table public.messages add column if not exists message text;
alter table public.messages add column if not exists related_request_id uuid;
alter table public.messages add column if not exists is_read boolean not null default false;
alter table public.messages add column if not exists created_at timestamptz not null default now();

alter table public.cards drop constraint if exists cards_role_check;
alter table public.cards
add constraint cards_role_check check (role in ('student', 'employee', 'admin', 'guest'));

alter table public.cards drop constraint if exists cards_status_check;
alter table public.cards
add constraint cards_status_check check (status in ('active', 'blocked', 'expired'));

alter table public.approval_sessions drop constraint if exists approval_sessions_status_check;
alter table public.approval_sessions
add constraint approval_sessions_status_check check (status in ('waiting', 'approved', 'rejected', 'expired'));

alter table public.access_logs drop constraint if exists access_logs_result_check;
alter table public.access_logs
add constraint access_logs_result_check check (result in ('approved', 'rejected', 'expired'));

alter table public.access_requests drop constraint if exists access_requests_status_check;
alter table public.access_requests
add constraint access_requests_status_check check (status in ('pending', 'reviewed', 'approved', 'rejected'));

create unique index if not exists cards_user_id_idx on public.cards(user_id);
create unique index if not exists cards_email_idx on public.cards(lower(email));
create unique index if not exists cards_uid_idx on public.cards(uid);
create index if not exists cards_role_idx on public.cards(role);
create index if not exists cards_status_idx on public.cards(status);
create index if not exists approval_sessions_user_id_idx on public.approval_sessions(user_id);
create index if not exists approval_sessions_uid_idx on public.approval_sessions(uid);
create index if not exists approval_sessions_status_idx on public.approval_sessions(status);
create index if not exists approval_sessions_created_at_idx on public.approval_sessions(created_at desc);
create index if not exists approval_sessions_expires_at_idx on public.approval_sessions(expires_at);
create index if not exists access_logs_uid_idx on public.access_logs(uid);
create index if not exists access_logs_card_uid_idx on public.access_logs(card_uid);
create index if not exists access_logs_email_idx on public.access_logs(lower(email));
create index if not exists access_logs_created_at_idx on public.access_logs(created_at desc);
create index if not exists access_requests_created_at_idx on public.access_requests(created_at desc);
create index if not exists access_requests_email_idx on public.access_requests(lower(email));
create index if not exists access_requests_status_idx on public.access_requests(status);
create index if not exists messages_email_idx on public.messages(lower(email));
create index if not exists messages_user_id_idx on public.messages(user_id);
create index if not exists messages_created_at_idx on public.messages(created_at desc);
create index if not exists messages_is_read_idx on public.messages(is_read);

alter table public.cards enable row level security;
alter table public.approval_sessions enable row level security;
alter table public.access_logs enable row level security;
alter table public.access_requests enable row level security;
alter table public.messages enable row level security;

drop policy if exists "cards users can read own card" on public.cards;
create policy "cards users can read own card"
on public.cards for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "cards admins can read all cards" on public.cards;
create policy "cards admins can read all cards"
on public.cards for select
to authenticated
using (public.is_smartpass_admin());

drop policy if exists "cards anon can read cards for waiting approval" on public.cards;
create policy "cards anon can read cards for waiting approval"
on public.cards for select
to anon
using (
  status = 'active'
  and exists (
    select 1
    from public.approval_sessions
    where approval_sessions.uid = cards.uid
      and approval_sessions.status = 'waiting'
      and (approval_sessions.expires_at is null or approval_sessions.expires_at > now())
  )
);

drop policy if exists "cards users can insert own card" on public.cards;
create policy "cards users can insert own card"
on public.cards for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "cards admins can update all cards" on public.cards;
create policy "cards admins can update all cards"
on public.cards for update
to authenticated
using (public.is_smartpass_admin())
with check (public.is_smartpass_admin());

drop policy if exists "approval users can create own sessions" on public.approval_sessions;
create policy "approval users can create own sessions"
on public.approval_sessions for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "approval users can read own sessions" on public.approval_sessions;
create policy "approval users can read own sessions"
on public.approval_sessions for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "approval admins can read all sessions" on public.approval_sessions;
create policy "approval admins can read all sessions"
on public.approval_sessions for select
to authenticated
using (public.is_smartpass_admin());

drop policy if exists "approval anon can read waiting sessions" on public.approval_sessions;
create policy "approval anon can read waiting sessions"
on public.approval_sessions for select
to anon
using (status in ('waiting', 'approved', 'rejected', 'expired'));

drop policy if exists "approval anon can approve waiting sessions" on public.approval_sessions;
create policy "approval anon can approve waiting sessions"
on public.approval_sessions for update
to anon
using (status = 'waiting')
with check (status in ('approved', 'rejected', 'expired'));

drop policy if exists "approval authenticated can update own waiting sessions" on public.approval_sessions;
create policy "approval authenticated can update own waiting sessions"
on public.approval_sessions for update
to authenticated
using (user_id = auth.uid() and status = 'waiting')
with check (user_id = auth.uid() and status in ('approved', 'rejected', 'expired'));

drop policy if exists "logs clients can insert logs" on public.access_logs;
create policy "logs clients can insert logs"
on public.access_logs for insert
to anon, authenticated
with check (true);

drop policy if exists "logs admins can read all logs" on public.access_logs;
create policy "logs admins can read all logs"
on public.access_logs for select
to authenticated
using (public.is_smartpass_admin());

drop policy if exists "logs users can read own logs" on public.access_logs;
create policy "logs users can read own logs"
on public.access_logs for select
to authenticated
using (lower(email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "requests clients can insert requests" on public.access_requests;
create policy "requests clients can insert requests"
on public.access_requests for insert
to anon, authenticated
with check (status = 'pending');

drop policy if exists "requests admins can read all requests" on public.access_requests;
create policy "requests admins can read all requests"
on public.access_requests for select
to authenticated
using (public.is_smartpass_admin());

drop policy if exists "requests admins can update all requests" on public.access_requests;
create policy "requests admins can update all requests"
on public.access_requests for update
to authenticated
using (public.is_smartpass_admin())
with check (public.is_smartpass_admin());

drop policy if exists "messages users can read own messages" on public.messages;
create policy "messages users can read own messages"
on public.messages for select
to authenticated
using (
  user_id = auth.uid()
  or lower(email) = lower(auth.jwt() ->> 'email')
);

drop policy if exists "messages users can update own messages" on public.messages;
create policy "messages users can update own messages"
on public.messages for update
to authenticated
using (
  user_id = auth.uid()
  or lower(email) = lower(auth.jwt() ->> 'email')
)
with check (
  user_id = auth.uid()
  or lower(email) = lower(auth.jwt() ->> 'email')
);

drop policy if exists "messages admins can insert messages" on public.messages;
create policy "messages admins can insert messages"
on public.messages for insert
to authenticated
with check (public.is_smartpass_admin());

drop policy if exists "messages admins can read all messages" on public.messages;
create policy "messages admins can read all messages"
on public.messages for select
to authenticated
using (public.is_smartpass_admin());

drop policy if exists "messages admins can update all messages" on public.messages;
create policy "messages admins can update all messages"
on public.messages for update
to authenticated
using (public.is_smartpass_admin())
with check (public.is_smartpass_admin());

create or replace function public.handle_new_auth_user_card()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  card_full_name text;
begin
  card_full_name := trim(coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    split_part(new.email, '@', 1),
    'SmartPass User'
  ));

  insert into public.cards (user_id, email, full_name, uid, access_code)
  values (
    new.id,
    new.email,
    card_full_name,
    public.generate_smartpass_uid(),
    public.generate_smartpass_access_code()
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_card on auth.users;
create trigger on_auth_user_created_create_card
after insert on auth.users
for each row execute function public.handle_new_auth_user_card();
