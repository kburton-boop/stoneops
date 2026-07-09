create table if not exists rate_defaults (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references accounts (id),
  formula_type text not null check (formula_type in ('percentage_fsc', 'per_mile_fsc')),
  target_per_hour numeric not null,
  time_add_hours numeric not null,
  avg_speed_mph numeric not null,
  mpg numeric not null,
  ppg numeric not null,
  fsc_percent numeric,
  baseline_price numeric,
  updated_at timestamptz not null default now()
);
create index if not exists rate_defaults_account_id_idx on rate_defaults (account_id);

alter table rate_defaults enable row level security;

drop policy if exists "deny_all" on rate_defaults;
create policy "deny_all" on rate_defaults for all using (false) with check (false);
