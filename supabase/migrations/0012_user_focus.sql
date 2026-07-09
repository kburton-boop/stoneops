create table if not exists user_focus (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique,
  focus_text text,
  updated_at timestamptz not null default now()
);
create index if not exists user_focus_user_id_idx on user_focus (user_id);

alter table user_focus enable row level security;

drop policy if exists "deny_all" on user_focus;
create policy "deny_all" on user_focus for all using (false) with check (false);
