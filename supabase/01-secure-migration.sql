-- Run in the confirmed project: yfpdcwhhnnucqjahoilz.
-- Back up your tournament first. This migration preserves existing rows.
-- The old browser-only app cannot read or write after this transaction commits.
begin;
create table if not exists public.tournament_data (
  id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.tournament_data add column if not exists revision bigint not null default 0;
alter table public.tournament_data enable row level security;
-- Remove permissive legacy policies and revoke direct browser access.
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='tournament_data'
  loop execute format('drop policy %I on public.tournament_data',p.policyname); end loop;
end $$;
revoke all on table public.tournament_data from public,anon,authenticated;
grant select,insert,update on table public.tournament_data to service_role;

create table if not exists public.tournament_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.tournament_admins enable row level security;
revoke all on table public.tournament_admins from public,anon,authenticated;
grant select on table public.tournament_admins to service_role;

-- Atomic compare-and-swap prevents two admin sessions silently overwriting data.
create or replace function public.save_tournament_state(p_id text,p_state jsonb,p_expected_revision bigint)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare next_revision bigint;
begin
  if p_expected_revision=-1 then
    insert into public.tournament_data(id,state,updated_at,revision)
    values(p_id,p_state,now(),0) on conflict(id) do nothing
    returning revision into next_revision;
  else
    update public.tournament_data set state=p_state,updated_at=now(),revision=revision+1
    where id=p_id and revision=p_expected_revision returning revision into next_revision;
  end if;
  if next_revision is null then return jsonb_build_object('conflict',true); end if;
  return jsonb_build_object('revision',next_revision);
end $$;
revoke all on function public.save_tournament_state(text,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.save_tournament_state(text,jsonb,bigint) to service_role;

create table if not exists public.tournament_auth_limits (
  bucket text primary key,
  window_start timestamptz not null default now(),
  attempts integer not null default 1
);
alter table public.tournament_auth_limits enable row level security;
revoke all on table public.tournament_auth_limits from public,anon,authenticated;
grant select,insert,update,delete on public.tournament_auth_limits to service_role;
create or replace function public.tournament_auth_attempt(p_bucket text,p_limit integer,p_window_seconds integer)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare n integer;
begin
  delete from public.tournament_auth_limits where window_start < now()-interval '2 days';
  insert into public.tournament_auth_limits(bucket,window_start,attempts) values(p_bucket,now(),1)
  on conflict(bucket) do update set
    attempts=case when tournament_auth_limits.window_start < now()-make_interval(secs=>p_window_seconds) then 1 else tournament_auth_limits.attempts+1 end,
    window_start=case when tournament_auth_limits.window_start < now()-make_interval(secs=>p_window_seconds) then now() else tournament_auth_limits.window_start end
  returning attempts into n;
  return n<=p_limit;
end $$;
revoke all on function public.tournament_auth_attempt(text,integer,integer) from public,anon,authenticated;
grant execute on function public.tournament_auth_attempt(text,integer,integer) to service_role;
commit;
