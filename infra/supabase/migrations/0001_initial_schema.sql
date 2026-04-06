create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  email text unique,
  display_name text,
  experience_level text not null default 'intermediate',
  created_at timestamptz not null default now()
);

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  muscle_group text not null,
  sub_group text,
  movement_type text not null,
  equipment_type text,
  created_at timestamptz not null default now()
);

create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  goal text not null,
  days_per_week integer not null,
  is_active boolean not null default true,
  is_template boolean not null default false,
  template_id uuid,
  generated_rationale text,
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  program_id uuid references public.programs(id) on delete set null,
  name text not null,
  status text not null default 'planned',
  logged_at timestamptz,
  readiness_flag text,
  created_at timestamptz not null default now()
);

create table if not exists public.session_exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id),
  sort_order integer not null,
  target_sets integer,
  target_reps integer,
  target_weight_kg numeric(6,2),
  created_at timestamptz not null default now()
);

create table if not exists public.sets (
  id uuid primary key default gen_random_uuid(),
  session_exercise_id uuid not null references public.session_exercises(id) on delete cascade,
  set_number integer not null,
  reps integer not null,
  weight_kg numeric(6,2) not null,
  completed boolean not null default false,
  rpe numeric(3,1),
  is_failed boolean not null default false,
  completion_source text not null default 'manual',
  created_at timestamptz not null default now()
);

create table if not exists public.suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete cascade,
  exercise_id uuid references public.exercises(id),
  suggestion_type text not null,
  reason_code text not null,
  share_text text,
  explanation text,
  target_weight_kg numeric(6,2),
  target_reps integer,
  target_sets integer,
  created_at timestamptz not null default now()
);

create table if not exists public.exercise_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id),
  note_text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, exercise_id)
);

create table if not exists public.exercise_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id),
  dumbbell_mode boolean not null default false,
  base_weight_kg numeric(6,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, exercise_id)
);

create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  exercise_id uuid references public.exercises(id),
  record_type text not null,
  value numeric(10,2) not null,
  previous_value numeric(10,2),
  session_id uuid references public.sessions(id) on delete cascade,
  achieved_at timestamptz not null default now()
);

create table if not exists public.landmark_weights (
  id uuid primary key default gen_random_uuid(),
  exercise_name text not null,
  landmark_weight_kg numeric(6,2) not null,
  label text not null,
  unique (exercise_name, landmark_weight_kg)
);

create table if not exists public.user_repiq_code (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  code text not null unique,
  qr_code_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.user_privacy_settings (
  user_id uuid primary key references public.users(id) on delete cascade,
  profile_searchable_by_email boolean not null default true,
  profile_searchable_by_phone boolean not null default false,
  show_weights_to_connections boolean not null default false,
  show_overload_suggestions_to_connections boolean not null default false,
  coach_view_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references public.users(id) on delete cascade,
  requested_user_id uuid not null references public.users(id) on delete cascade,
  status text not null,
  connection_type text not null default 'standard',
  coach_view_approved boolean not null default false,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  unique (requester_user_id, requested_user_id)
);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references public.users(id) on delete cascade,
  referee_user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'pending',
  activation_trigger text,
  created_at timestamptz not null default now()
);

create table if not exists public.injury_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  body_area text not null,
  severity text,
  status text not null default 'active',
  source text not null default 'return_check_in',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.session_context_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  session_id uuid not null unique references public.sessions(id) on delete cascade,
  note_text text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_programs_user_id on public.programs(user_id);
create index if not exists idx_sessions_user_id on public.sessions(user_id);
create index if not exists idx_session_exercises_session_id on public.session_exercises(session_id);
create index if not exists idx_sets_session_exercise_id on public.sets(session_exercise_id);
create index if not exists idx_suggestions_user_id on public.suggestions(user_id);
create index if not exists idx_records_user_id on public.records(user_id);
create index if not exists idx_connections_requested_user_id on public.connections(requested_user_id);
