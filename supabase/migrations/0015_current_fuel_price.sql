create table if not exists current_fuel_price (
  id uuid primary key default gen_random_uuid(),
  ppg numeric not null,
  source text not null default 'EIA PADD2 weekly',
  period_date date not null,
  fetched_at timestamptz not null default now()
);
create index if not exists current_fuel_price_period_date_idx on current_fuel_price (period_date desc);

alter table current_fuel_price enable row level security;

drop policy if exists "deny_all" on current_fuel_price;
create policy "deny_all" on current_fuel_price for all using (false) with check (false);
