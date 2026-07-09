alter table accounts add column if not exists kind text not null default 'plant' check (kind in ('plant', 'customer'));

create table if not exists customer_contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts (id),
  name text not null,
  role text,
  created_at timestamptz not null default now()
);
create index if not exists customer_contacts_account_id_idx on customer_contacts (account_id);

create table if not exists customer_topics (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  account_id uuid references accounts (id),
  title text not null,
  description text,
  status text not null default 'open' check (status in ('open', 'discussed')),
  related_to text,
  created_at timestamptz not null default now(),
  discussed_at timestamptz
);
create index if not exists customer_topics_user_id_idx on customer_topics (user_id);
create index if not exists customer_topics_account_id_idx on customer_topics (account_id);

alter table customer_contacts enable row level security;
alter table customer_topics enable row level security;

drop policy if exists "deny_all" on customer_contacts;
create policy "deny_all" on customer_contacts for all using (false) with check (false);

drop policy if exists "deny_all" on customer_topics;
create policy "deny_all" on customer_topics for all using (false) with check (false);
