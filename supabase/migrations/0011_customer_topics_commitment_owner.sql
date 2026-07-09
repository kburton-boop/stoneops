alter table customer_topics add column if not exists commitment_owner text;

alter table customer_topics drop constraint if exists customer_topics_commitment_owner_check;
alter table customer_topics add constraint customer_topics_commitment_owner_check
  check (commitment_owner is null or commitment_owner in ('me', 'them'));
