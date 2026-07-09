create table if not exists general_notes (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  text text not null,
  tags text[] not null default '{}',
  related_account_id uuid references accounts (id),
  created_at timestamptz not null default now()
);
create index if not exists general_notes_user_id_idx on general_notes (user_id);
create index if not exists general_notes_related_account_id_idx on general_notes (related_account_id);

alter table general_notes enable row level security;

drop policy if exists "deny_all" on general_notes;
create policy "deny_all" on general_notes for all using (false) with check (false);
