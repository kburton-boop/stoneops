create table if not exists rate_calculations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  account_id uuid references accounts (id),
  formula_type text not null check (formula_type in ('percentage_fsc', 'per_mile_fsc')),
  inputs jsonb not null,
  outputs jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists rate_calculations_user_id_idx on rate_calculations (user_id);
create index if not exists rate_calculations_account_id_idx on rate_calculations (account_id);

alter table rate_calculations enable row level security;

drop policy if exists "deny_all" on rate_calculations;
create policy "deny_all" on rate_calculations for all using (false) with check (false);
