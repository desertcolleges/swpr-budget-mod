-- IEDRC Budget Modification: round workflow + status portal setup
-- Run in Supabase SQL editor. Safe to re-run.

create extension if not exists pgcrypto;

create table if not exists public.site_config (
  id integer primary key,
  visible_rounds text[] not null default array['R10']::text[],
  updated_at timestamptz not null default now()
);

insert into public.site_config (id, visible_rounds)
values (1, array['R10']::text[])
on conflict (id) do nothing;

alter table public.submission_modifications
  add column if not exists is_deleted boolean not null default false,
  add column if not exists is_new_line boolean not null default false,
  add column if not exists round text,
  add column if not exists proposed_activity_title text;

alter table public.budget_submissions
  add column if not exists round text;


alter table public.budget_submissions
  add column if not exists status_access_token text;

create table if not exists public.activity_management (
  id uuid primary key default gen_random_uuid(),
  project_title text,
  activity_name text not null,
  object_code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.site_config enable row level security;
alter table public.activity_management enable row level security;

-- Site config policies
DROP POLICY IF EXISTS "Public can read site config" ON public.site_config;
create policy "Public can read site config"
on public.site_config
for select
to anon, authenticated
using (true);

DROP POLICY IF EXISTS "Active admins can update site config" ON public.site_config;
create policy "Active admins can update site config"
on public.site_config
for update
to authenticated
using (
  exists (
    select 1
    from public.admin_users a
    where a.user_id = auth.uid() and a.active = true
  )
)
with check (
  exists (
    select 1
    from public.admin_users a
    where a.user_id = auth.uid() and a.active = true
  )
);

DROP POLICY IF EXISTS "Active admins can insert site config" ON public.site_config;
create policy "Active admins can insert site config"
on public.site_config
for insert
to authenticated
with check (
  exists (
    select 1
    from public.admin_users a
    where a.user_id = auth.uid() and a.active = true
  )
);

-- Activity management placeholder policies
DROP POLICY IF EXISTS "Active admins can read activity management" ON public.activity_management;
create policy "Active admins can read activity management"
on public.activity_management
for select
to authenticated
using (
  exists (
    select 1
    from public.admin_users a
    where a.user_id = auth.uid() and a.active = true
  )
);

DROP POLICY IF EXISTS "Active admins can manage activity management" ON public.activity_management;
create policy "Active admins can manage activity management"
on public.activity_management
for all
to authenticated
using (
  exists (
    select 1
    from public.admin_users a
    where a.user_id = auth.uid() and a.active = true
  )
)
with check (
  exists (
    select 1
    from public.admin_users a
    where a.user_id = auth.uid() and a.active = true
  )
);

-- Secure requester status lookup: requires request number + requester email, and validates token when provided.
create or replace function public.get_request_status(
  p_request_number text,
  p_requester_email text default null,
  p_status_token text default null
)
returns table (
  submission_id uuid,
  request_number text,
  requester_name text,
  requester_email text,
  institution text,
  round text,
  status text,
  admin_notes text,
  justification text,
  created_at timestamptz,
  reviewed_at timestamptz,
  title text,
  activity_title text,
  proposed_activity_title text,
  object_code text,
  budget_item_description text,
  proposed_description text,
  current_budget numeric,
  proposed_budget numeric,
  is_deleted boolean,
  is_new_line boolean,
  modification_round text
)
language sql
security definer
set search_path = public
as $$
  select
    bs.id as submission_id,
    bs.request_number,
    bs.requester_name,
    bs.requester_email,
    bs.institution,
    bs.round,
    bs.status,
    bs.admin_notes,
    bs.justification,
    bs.created_at,
    bs.reviewed_at,
    sm.title,
    sm.activity_title,
    sm.proposed_activity_title,
    sm.object_code,
    sm.budget_item_description,
    sm.proposed_description,
    sm.current_budget,
    sm.proposed_budget,
    sm.is_deleted,
    sm.is_new_line,
    sm.round as modification_round
  from public.budget_submissions bs
  left join public.submission_modifications sm
    on sm.submission_id = bs.id
  where lower(bs.request_number) = lower(trim(p_request_number))
    and (
      (
        p_status_token is not null
        and p_status_token <> ''
        and bs.status_access_token = p_status_token
      )
      or
      (
        p_requester_email is not null
        and lower(bs.requester_email) = lower(trim(p_requester_email))
      )
    );
$$;

revoke all on function public.get_request_status(text, text, text) from public;
grant execute on function public.get_request_status(text, text, text) to anon, authenticated;
