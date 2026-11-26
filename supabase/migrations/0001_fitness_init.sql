-- Fitness app schema. Every row belongs to the signed-in user (row-level security).
-- Ids are generated on the phone so workouts can be logged offline and synced later.

create table if not exists public.routines (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  key text not null,
  name text not null,
  sub text not null default '',
  day_hint int,
  exercises jsonb not null default '[]',
  warmup jsonb not null default '[]',
  cooldown jsonb not null default '[]',
  cardio text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.workouts (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  routine_key text,
  name text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  notes text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.set_logs (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  workout_id text not null,
  exercise_id text not null,
  exercise_name text not null,
  set_no int not null,
  kg numeric not null default 0,       -- plates / one dumbbell / stack / assistance
  bar_kg numeric not null default 0,   -- bar weight, stored separately
  reps int not null default 0,
  rir int,
  is_warmup boolean not null default false,
  completed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists set_logs_workout on public.set_logs (user_id, workout_id);
create index if not exists set_logs_exercise on public.set_logs (user_id, exercise_id);

create table if not exists public.cardio_logs (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  workout_id text,
  performed_at timestamptz not null,
  type text not null,
  minutes numeric not null default 0,
  avg_hr int,
  rpe numeric,
  distance_km numeric,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.body_metrics (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  date date not null,
  weight_kg numeric,
  waist_cm numeric,
  body_fat_pct numeric,
  muscle_kg numeric,
  source text not null default 'manual',
  notes text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.food_entries (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  eaten_at timestamptz not null,
  day date not null,
  meal_window text not null,
  name text not null,
  protein_g numeric not null default 0,
  kcal numeric not null default 0,
  source text not null default 'manual',
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists food_entries_day on public.food_entries (user_id, day);

create table if not exists public.weekly_reviews (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  week_start date not null,
  summary_md text not null default '',
  weak_groups text[] not null default '{}',
  plan_json jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

do $$
declare t text;
begin
  foreach t in array array['routines','workouts','set_logs','cardio_logs','body_metrics','food_entries','weekly_reviews'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
  end loop;
end $$;
