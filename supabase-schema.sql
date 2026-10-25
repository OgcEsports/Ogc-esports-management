-- OGC ESPORTS Management Portal
-- Run this in Supabase SQL Editor using the project owner account.
-- IMPORTANT: Never expose a service_role key in config.js or browser code.

create extension if not exists pgcrypto;

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

insert into public.teams(name) values
('OGC GALAXY'),('OGC LDR'),('OGC TITAN'),('OGC BRB'),('OGC NMS'),
('OGC ROYALS'),('OGC SYNDICATE'),('OGC AXOLOTLS'),('OGC RANGERS'),
('OGC X GLADIATOR'),('OGC HUSTLERS'),('OGC ESPORTS'),('OGC ESPORTS 1'),
('OGC ESPORTS 2'),('OGC ESPORTS 3')
on conflict (name) do nothing;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  birth_date date not null,
  phone text not null,
  email text,
  account_type text not null check (account_type in ('player','member','owner')),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  member_access_approved boolean not null default false,
  team_id uuid references public.teams(id),
  ign text,
  ff_uid text,
  player_role text check (player_role is null or player_role in ('Primary rusher','Secondary rusher','Nader','Sniper','Assaulter (5th player)')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  constraint player_fields_required check (
    account_type <> 'player' or
    (team_id is not null and nullif(trim(ign),'') is not null and nullif(trim(ff_uid),'') is not null and player_role is not null)
  ),
  constraint member_has_no_player_role check (
    account_type <> 'member' or (team_id is null and player_role is null and ign is null and ff_uid is null)
  )
);

-- Organization content tables. Only the owner can insert/update/delete.
create table if not exists public.team_records (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  category text not null check (category in ('attendance','drills','lobby_os','doubt_box','tournament_schedules','upcoming_sessions','review')),
  title text not null,
  details text not null default '',
  record_date date not null default current_date,
  status text not null default 'published' check (status in ('published','pending','completed')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.player_activity (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  activity_date date not null default current_date,
  activity_type text not null,
  points integer not null default 0 check (points >= 0),
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.team_daily_metrics (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  metric_date date not null default current_date,
  performance_score numeric(5,2) not null default 0 check (performance_score >= 0 and performance_score <= 100),
  attendance_percent numeric(5,2) not null default 0 check (attendance_percent >= 0 and attendance_percent <= 100),
  notes text not null default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(team_id, metric_date)
);

alter table public.teams enable row level security;
alter table public.profiles enable row level security;
alter table public.team_records enable row level security;
alter table public.player_activity enable row level security;
alter table public.team_daily_metrics enable row level security;

-- Helper checks. Owner is a single account set manually in profiles by the project owner.
create or replace function public.is_ogc_owner()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.account_type = 'owner' and p.status = 'approved'
  );
$$;

create or replace function public.my_ogc_profile()
returns public.profiles language sql stable security definer set search_path = public
as $$
  select p from public.profiles p where p.id = auth.uid() limit 1;
$$;

create or replace function public.can_view_team(target_team uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_ogc_owner() or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'approved'
      and (
        (p.account_type = 'player' and p.team_id = target_team)
        or (p.account_type = 'member' and p.member_access_approved = true)
      )
  );
$$;

-- Restrict table permissions, then grant authenticated access governed by RLS.
grant usage on schema public to authenticated;
grant select on public.teams to authenticated;
grant select, insert on public.profiles to authenticated;
grant update on public.profiles to authenticated;
grant select, insert, update, delete on public.team_records to authenticated;
grant select, insert, update, delete on public.player_activity to authenticated;
grant select, insert, update, delete on public.team_daily_metrics to authenticated;

drop policy if exists "Signed-in users can read team list" on public.teams;
create policy "Signed-in users can read team list" on public.teams
for select to authenticated using (true);

drop policy if exists "Users can create own pending player/member profile" on public.profiles;
create policy "Users can create own pending player/member profile" on public.profiles
for insert to authenticated
with check (
  id = auth.uid()
  and account_type in ('player','member')
  and status = 'pending'
  and member_access_approved = false
  and reviewed_by is null
  and reviewed_at is null
);

drop policy if exists "Users can read own profile or permitted profiles" on public.profiles;
drop policy if exists "Users can read only own profile or owner can read all" on public.profiles;
create policy "Users can read only own profile or owner can read all" on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_ogc_owner());

-- Return only team names and approved-player counts to approved members; never expose player PII.
create or replace function public.get_team_player_counts()
returns table(team_id uuid, approved_count bigint)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not (public.is_ogc_owner() or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.account_type = 'member'
      and p.status = 'approved' and p.member_access_approved = true
  )) then
    raise exception 'Not authorized';
  end if;
  return query
    select t.id, count(p.id)
    from public.teams t
    left join public.profiles p on p.team_id = t.id
      and p.account_type = 'player' and p.status = 'approved'
    group by t.id;
end;
$$;
grant execute on function public.get_team_player_counts() to authenticated;

-- No self-edits: all profile updates are owner-only.
drop policy if exists "Only owner can update profiles" on public.profiles;
create policy "Only owner can update profiles" on public.profiles
for update to authenticated using (public.is_ogc_owner()) with check (public.is_ogc_owner());

drop policy if exists "Permitted users can read team records" on public.team_records;
create policy "Permitted users can read team records" on public.team_records
for select to authenticated using (public.can_view_team(team_id));

drop policy if exists "Only owner can insert team records" on public.team_records;
create policy "Only owner can insert team records" on public.team_records
for insert to authenticated with check (public.is_ogc_owner());

drop policy if exists "Only owner can update team records" on public.team_records;
create policy "Only owner can update team records" on public.team_records
for update to authenticated using (public.is_ogc_owner()) with check (public.is_ogc_owner());

drop policy if exists "Only owner can delete team records" on public.team_records;
create policy "Only owner can delete team records" on public.team_records
for delete to authenticated using (public.is_ogc_owner());

drop policy if exists "Permitted users can read player activity" on public.player_activity;
create policy "Permitted users can read player activity" on public.player_activity
for select to authenticated using (
  public.is_ogc_owner() or public.can_view_team(team_id)
);

drop policy if exists "Only owner can insert player activity" on public.player_activity;
create policy "Only owner can insert player activity" on public.player_activity
for insert to authenticated with check (public.is_ogc_owner());

drop policy if exists "Only owner can update player activity" on public.player_activity;
create policy "Only owner can update player activity" on public.player_activity
for update to authenticated using (public.is_ogc_owner()) with check (public.is_ogc_owner());

drop policy if exists "Only owner can delete player activity" on public.player_activity;
create policy "Only owner can delete player activity" on public.player_activity
for delete to authenticated using (public.is_ogc_owner());

drop policy if exists "Permitted users can read daily team metrics" on public.team_daily_metrics;
create policy "Permitted users can read daily team metrics" on public.team_daily_metrics
for select to authenticated using (public.can_view_team(team_id));

drop policy if exists "Only owner can insert daily team metrics" on public.team_daily_metrics;
create policy "Only owner can insert daily team metrics" on public.team_daily_metrics
for insert to authenticated with check (public.is_ogc_owner());

drop policy if exists "Only owner can update daily team metrics" on public.team_daily_metrics;
create policy "Only owner can update daily team metrics" on public.team_daily_metrics
for update to authenticated using (public.is_ogc_owner()) with check (public.is_ogc_owner());

drop policy if exists "Only owner can delete daily team metrics" on public.team_daily_metrics;
create policy "Only owner can delete daily team metrics" on public.team_daily_metrics
for delete to authenticated using (public.is_ogc_owner());

-- Important setup note:
-- Create your owner auth user through Supabase Auth first, then run a one-time SQL
-- update to change that user's profile to account_type='owner', status='approved'.
-- To avoid anyone claiming owner status, do NOT create owner through public signup.


-- OGC Attendance + Drills + Lobby OS submissions (run after the starter schema)
create table if not exists public.attendance_records (
  id bigint generated by default as identity primary key,
  player_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  attendance_date date not null default (timezone('Asia/Kolkata', now()))::date,
  status text not null default 'present' check (status in ('present','absent')),
  marked_at timestamptz not null default now(),
  notes text,
  unique(player_id, attendance_date)
);
alter table public.attendance_records enable row level security;
drop policy if exists attendance_read_own_or_team on public.attendance_records;
create policy attendance_read_own_or_team on public.attendance_records for select to authenticated using (player_id = auth.uid() or public.can_view_team(team_id));
drop policy if exists attendance_insert_own on public.attendance_records;
create policy attendance_insert_own on public.attendance_records for insert to authenticated with check (player_id = auth.uid() and exists (select 1 from public.profiles p where p.id=auth.uid() and p.account_type='player' and p.status='approved' and p.team_id=attendance_records.team_id));
create or replace function public.mark_my_attendance() returns void language plpgsql security invoker set search_path=public as $$
declare p public.profiles%rowtype; local_time time; local_date date;
begin
  select * into p from public.profiles where id=auth.uid() and account_type='player' and status='approved';
  if p.id is null or p.team_id is null then raise exception 'Approved player profile and team assignment required'; end if;
  local_time := (now() at time zone 'Asia/Kolkata')::time; local_date := (now() at time zone 'Asia/Kolkata')::date;
  if local_time >= time '21:00' then raise exception 'Attendance deadline (9:00 PM IST) has passed'; end if;
  insert into public.attendance_records(player_id,team_id,attendance_date,status) values(auth.uid(),p.team_id,local_date,'present') on conflict(player_id,attendance_date) do nothing;
  if not found then raise exception 'Attendance already submitted for today'; end if;
end; $$;
grant execute on function public.mark_my_attendance() to authenticated;

create table if not exists public.team_submissions (
  id bigint generated by default as identity primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('DRILLS','LOBBY OS')),
  title text not null check (length(trim(title)) between 1 and 120),
  category text, details text not null check (length(trim(details)) between 1 and 4000),
  proof_url text, status text not null default 'submitted' check (status in ('submitted','reviewed','approved','needs_changes')) ,
  created_at timestamptz not null default now()
);
alter table public.team_submissions enable row level security;
drop policy if exists submissions_read_own_or_team on public.team_submissions;
create policy submissions_read_own_or_team on public.team_submissions for select to authenticated using (user_id=auth.uid() or public.can_view_team(team_id));
drop policy if exists submissions_insert_own on public.team_submissions;
create policy submissions_insert_own on public.team_submissions for insert to authenticated with check (user_id=auth.uid() and exists (select 1 from public.profiles p where p.id=auth.uid() and p.status='approved' and (p.account_type in ('owner','member') or (p.account_type='player' and p.team_id=team_submissions.team_id))));
grant select, insert on public.team_submissions to authenticated;
grant usage, select on sequence public.team_submissions_id_seq to authenticated;

-- OGC ESPORTS portal additions: events, doubt box, and upload access.
-- Run this file in Supabase SQL Editor after backing up any existing data.

create table if not exists public.portal_events (
  id bigint generated by default as identity primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  event_type text not null check (event_type in ('TOURNAMENT','SESSION')),
  title text not null check (length(trim(title)) between 1 and 160),
  event_date date not null,
  event_time time not null,
  conductor text,
  description text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.portal_events enable row level security;
grant select, insert, update, delete on public.portal_events to authenticated;
grant usage, select on sequence public.portal_events_id_seq to authenticated;
drop policy if exists portal_events_read_approved on public.portal_events;
create policy portal_events_read_approved on public.portal_events for select to authenticated
using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.status='approved'));
drop policy if exists portal_events_insert_owner_or_member_tournament on public.portal_events;
create policy portal_events_insert_owner_or_member_tournament on public.portal_events for insert to authenticated
with check (
  exists(select 1 from public.profiles p where p.id=auth.uid() and p.status='approved' and
    (p.account_type='owner' or (p.account_type='member' and event_type='TOURNAMENT')))
);
drop policy if exists portal_events_update_owner_or_member_tournament on public.portal_events;
create policy portal_events_update_owner_or_member_tournament on public.portal_events for update to authenticated
using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.status='approved' and
    (p.account_type='owner' or (p.account_type='member' and event_type='TOURNAMENT'))))
with check (exists(select 1 from public.profiles p where p.id=auth.uid() and p.status='approved' and
    (p.account_type='owner' or (p.account_type='member' and event_type='TOURNAMENT'))));
drop policy if exists portal_events_delete_owner_only on public.portal_events;
create policy portal_events_delete_owner_only on public.portal_events for delete to authenticated
using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_type='owner' and p.status='approved'));

create table if not exists public.doubt_submissions (
  id bigint generated by default as identity primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  question text not null check (length(trim(question)) between 1 and 4000),
  attachment_paths text[] not null default '{}',
  status text not null default 'submitted' check (status in ('submitted','answered')),
  owner_response text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.doubt_submissions enable row level security;
grant select, insert, update on public.doubt_submissions to authenticated;
drop policy if exists doubt_read_own_or_managers on public.doubt_submissions;
create policy doubt_read_own_or_managers on public.doubt_submissions for select to authenticated
using (user_id=auth.uid() or exists(select 1 from public.profiles p where p.id=auth.uid() and p.status='approved' and p.account_type in ('owner','member')));
drop policy if exists doubt_insert_player_only on public.doubt_submissions;
create policy doubt_insert_player_only on public.doubt_submissions for insert to authenticated
with check (user_id=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.status='approved' and p.account_type='player' and p.team_id=doubt_submissions.team_id));
drop policy if exists doubt_update_owner_only on public.doubt_submissions;
create policy doubt_update_owner_only on public.doubt_submissions for update to authenticated
using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.status='approved' and p.account_type='owner'))
with check (exists(select 1 from public.profiles p where p.id=auth.uid() and p.status='approved' and p.account_type='owner'));

-- Existing storage buckets are reused: ogc-player-submissions and ogc-doubt-attachments.
-- Ensure these buckets exist in Storage and are PRIVATE. The following policies grant
-- authenticated approved players/owner access to player proofs and doubt attachments.
-- If a policy with the same name already exists, drop it first before rerunning this file.
drop policy if exists ogc_player_upload_approved on storage.objects;
create policy ogc_player_upload_approved on storage.objects for insert to authenticated
with check (bucket_id='ogc-player-submissions' and (storage.foldername(name))[2]=auth.uid()::text and exists(select 1 from public.profiles p where p.id=auth.uid() and p.status='approved' and p.account_type in ('player','owner')));
drop policy if exists ogc_player_read_approved on storage.objects;
create policy ogc_player_read_approved on storage.objects for select to authenticated
using (bucket_id='ogc-player-submissions' and exists(select 1 from public.profiles p where p.id=auth.uid() and p.status='approved' and (p.account_type in ('owner','member') or (p.account_type='player' and (storage.foldername(name))[2]=auth.uid()::text))));
drop policy if exists ogc_doubt_upload_approved_players on storage.objects;
create policy ogc_doubt_upload_approved_players on storage.objects for insert to authenticated
with check (bucket_id='ogc-doubt-attachments' and (storage.foldername(name))[1]=auth.uid()::text and exists(select 1 from public.profiles p where p.id=auth.uid() and p.status='approved' and p.account_type='player'));
drop policy if exists ogc_doubt_read_own_or_managers on storage.objects;
create policy ogc_doubt_read_own_or_managers on storage.objects for select to authenticated
using (bucket_id='ogc-doubt-attachments' and exists(select 1 from public.profiles p where p.id=auth.uid() and p.status='approved' and (p.account_type in ('owner','member') or (p.account_type='player' and (storage.foldername(name))[1]=auth.uid()::text))));
