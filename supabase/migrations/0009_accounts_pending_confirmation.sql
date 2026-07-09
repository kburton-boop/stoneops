alter table accounts drop constraint if exists accounts_status_check;
alter table accounts add constraint accounts_status_check
  check (status in ('hot', 'warm', 'cool', 'stable', 'pending_confirmation'));
