create extension if not exists pgcrypto;
create extension if not exists vector;

create table accounts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  plant_location text,
  contact_name text,
  contact_role text,
  status text not null default 'stable' check (status in ('hot', 'warm', 'cool', 'stable')),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index accounts_user_id_idx on accounts (user_id);

create table loads (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  account_id uuid references accounts (id),
  lane text,
  tonnage numeric,
  rate_type text check (rate_type in ('hourly', 'percentage', 'per_ton')),
  scheduled_date date,
  status text not null default 'scheduled' check (status in ('scheduled', 'in_progress', 'complete', 'cancelled')),
  driver text,
  created_at timestamptz not null default now()
);
create index loads_user_id_idx on loads (user_id);
create index loads_account_id_idx on loads (account_id);

create table corrective_actions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  account_id uuid references accounts (id),
  title text not null,
  description text,
  severity text not null default 'warm' check (severity in ('hot', 'warm', 'resolved')),
  incident_date date,
  vendor_involved text,
  resolution_notes text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index corrective_actions_user_id_idx on corrective_actions (user_id);
create index corrective_actions_account_id_idx on corrective_actions (account_id);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  title text not null,
  description text,
  urgency text not null default 'this_week' check (urgency in ('today', 'this_week', 'this_month', 'someday')),
  key boolean not null default false,
  account_id uuid references accounts (id),
  priority_score numeric,
  due_date date,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index tasks_user_id_idx on tasks (user_id);
create index tasks_account_id_idx on tasks (account_id);

create table lane_financials (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  account_id uuid references accounts (id),
  period date not null,
  net_tons numeric,
  revenue numeric,
  fuel_cost numeric,
  other_cost numeric,
  margin_pct numeric,
  fsc_applied boolean not null default false,
  created_at timestamptz not null default now()
);
create index lane_financials_user_id_idx on lane_financials (user_id);
create index lane_financials_account_id_idx on lane_financials (account_id);

create table raw_captures (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  source text not null,
  raw_text text,
  audio_url text,
  classification jsonb,
  routed_to text,
  routed_id uuid,
  created_at timestamptz not null default now()
);
create index raw_captures_user_id_idx on raw_captures (user_id);

create table memory_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  source_type text not null,
  source_id uuid not null,
  text text not null,
  embedding vector(1536),
  created_at timestamptz not null default now()
);
create index memory_chunks_user_id_idx on memory_chunks (user_id);
create index memory_chunks_embedding_idx on memory_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create table weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  week_start date not null,
  wins text,
  what_slipped text,
  open_loops text,
  accounts_to_follow_up uuid[],
  top_3_next_week text,
  created_at timestamptz not null default now()
);
create index weekly_reviews_user_id_idx on weekly_reviews (user_id);

-- RLS: deny-all for anon/authenticated roles. The service role key bypasses
-- RLS, so it's the only credential the app uses to read or write.
alter table accounts enable row level security;
alter table loads enable row level security;
alter table corrective_actions enable row level security;
alter table tasks enable row level security;
alter table lane_financials enable row level security;
alter table raw_captures enable row level security;
alter table memory_chunks enable row level security;
alter table weekly_reviews enable row level security;

create policy "deny_all" on accounts for all using (false) with check (false);
create policy "deny_all" on loads for all using (false) with check (false);
create policy "deny_all" on corrective_actions for all using (false) with check (false);
create policy "deny_all" on tasks for all using (false) with check (false);
create policy "deny_all" on lane_financials for all using (false) with check (false);
create policy "deny_all" on raw_captures for all using (false) with check (false);
create policy "deny_all" on memory_chunks for all using (false) with check (false);
create policy "deny_all" on weekly_reviews for all using (false) with check (false);
