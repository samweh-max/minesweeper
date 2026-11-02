-- Online leaderboard for Minesweeper.
-- Paste this whole file into Supabase: SQL Editor → New query → Run.
-- It is safe to run again; it only creates what is missing and replaces the functions.

create table if not exists public.scores (
  id bigint generated always as identity primary key,
  -- A random id each device makes for itself. Never shown to other players.
  player_id uuid not null,
  level text not null check (level in ('beginner', 'intermediate', 'expert')),
  name text not null check (char_length(name) between 1 and 20),
  -- Best winning time in milliseconds.
  ms integer not null check (ms > 0),
  -- Set to true in the Table Editor to take someone off the board. Their device can't undo it.
  hidden boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (player_id, level)
);

create index if not exists scores_level_ms on public.scores (level, ms) where not hidden;

-- Players never touch the table directly, only the two functions below.
alter table public.scores enable row level security;
revoke all on public.scores from anon, authenticated;

-- Fastest times allowed per level. Anything quicker is ignored as a cheat.
create or replace function public.minesweeper_min_ms(p_level text)
returns integer
language sql
immutable
as $$
  select case p_level
    when 'beginner' then 1000
    when 'intermediate' then 5000
    when 'expert' then 20000
  end;
$$;

-- Sends a player's best times. Only a faster time replaces a stored one.
-- Also renames all of the player's entries to p_name.
create or replace function public.submit_scores(p_player uuid, p_name text, p_times jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean text := left(btrim(regexp_replace(coalesce(p_name, ''), '[[:space:][:cntrl:]]+', ' ', 'g')), 20);
  lvl text;
  t integer;
begin
  if p_player is null then
    raise exception 'missing player';
  end if;
  if clean = '' or lower(clean) = 'anonymous' then
    raise exception 'pick a name first';
  end if;
  if jsonb_typeof(p_times) is distinct from 'object' then
    raise exception 'bad times';
  end if;

  foreach lvl in array array['beginner', 'intermediate', 'expert'] loop
    continue when jsonb_typeof(p_times -> lvl) is distinct from 'number';
    t := round((p_times ->> lvl)::numeric);
    continue when t < minesweeper_min_ms(lvl) or t > 3600000;

    insert into scores as s (player_id, level, name, ms)
    values (p_player, lvl, clean, t)
    on conflict (player_id, level) do update
      set ms = least(s.ms, excluded.ms),
          updated_at = case when excluded.ms < s.ms then now() else s.updated_at end;
  end loop;

  update scores set name = clean where player_id = p_player and name <> clean;
end;
$$;

-- Top p_limit times for a level, plus the asking player's own row if it is further down.
create or replace function public.leaderboard(p_level text, p_player uuid default null, p_limit integer default 10)
returns table (rank bigint, name text, ms integer, is_me boolean)
language sql
stable
security definer
set search_path = public
as $$
  with ranked as (
    select
      row_number() over (order by s.ms, s.updated_at, s.id) as rank,
      s.name,
      s.ms,
      coalesce(s.player_id = p_player, false) as is_me
    from scores s
    where s.level = p_level and not s.hidden
  )
  select rank, name, ms, is_me
  from ranked
  where rank <= least(greatest(coalesce(p_limit, 10), 1), 100) or is_me
  order by rank;
$$;

revoke all on function public.submit_scores(uuid, text, jsonb) from public;
revoke all on function public.leaderboard(text, uuid, integer) from public;
grant execute on function public.submit_scores(uuid, text, jsonb) to anon, authenticated;
grant execute on function public.leaderboard(text, uuid, integer) to anon, authenticated;
