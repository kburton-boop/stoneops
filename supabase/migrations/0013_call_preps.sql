create table if not exists call_preps (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  account_id uuid references accounts (id),
  raw_input text not null,
  generated_script text not null,
  created_at timestamptz not null default now()
);
create index if not exists call_preps_user_id_idx on call_preps (user_id);
create index if not exists call_preps_account_id_idx on call_preps (account_id);

alter table call_preps enable row level security;

drop policy if exists "deny_all" on call_preps;
create policy "deny_all" on call_preps for all using (false) with check (false);
