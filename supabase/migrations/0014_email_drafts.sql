create table if not exists email_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  account_id uuid references accounts (id),
  raw_input text not null,
  subject_line text not null,
  generated_body text not null,
  created_at timestamptz not null default now()
);
create index if not exists email_drafts_user_id_idx on email_drafts (user_id);
create index if not exists email_drafts_account_id_idx on email_drafts (account_id);

alter table email_drafts enable row level security;

drop policy if exists "deny_all" on email_drafts;
create policy "deny_all" on email_drafts for all using (false) with check (false);
