-- Atomic cascade delete for an account. Runs as a single transaction so a
-- crash mid-delete can never leave orphaned/inconsistent data (the
-- Supabase JS client has no multi-statement transaction support, so this
-- has to live in the database rather than a sequence of app-code calls).
--
-- Structured operational data that doesn't make sense without the account
-- (corrective_actions, customer_topics, rate_calculations,
-- customer_contacts, rate_defaults, loads, lane_financials, tasks) is
-- deleted outright. Historical/generated-content records that represent
-- "something that was actually said or generated" (general_notes,
-- call_preps, email_drafts, raw_captures) are preserved — only their
-- reference to the now-gone account is cleared. raw_captures has no real
-- FK column (the account reference lives inside the classification
-- jsonb blob as matched_account_id), so that gets rewritten directly,
-- with the account's name stashed alongside so the Activity Feed can
-- still say "Account deleted: <name>" instead of a generic "unmatched".
create or replace function delete_account_cascade(target_account_id uuid, target_user_id text)
returns void
language plpgsql
as $$
declare
  account_name text;
begin
  select name into account_name
  from accounts
  where id = target_account_id and user_id = target_user_id;

  if account_name is null then
    raise exception 'Account not found for this user';
  end if;

  delete from corrective_actions where account_id = target_account_id;
  delete from customer_topics where account_id = target_account_id;
  delete from rate_calculations where account_id = target_account_id;
  delete from customer_contacts where account_id = target_account_id;
  delete from rate_defaults where account_id = target_account_id;
  delete from loads where account_id = target_account_id;
  delete from lane_financials where account_id = target_account_id;
  delete from tasks where account_id = target_account_id;

  update general_notes
  set related_account_id = null
  where related_account_id = target_account_id;

  update call_preps
  set account_id = null
  where account_id = target_account_id;

  update email_drafts
  set account_id = null
  where account_id = target_account_id;

  update raw_captures
  set classification = classification
    || jsonb_build_object('matched_account_id', null, 'deleted_account_name', account_name)
  where classification ->> 'matched_account_id' = target_account_id::text;

  delete from accounts where id = target_account_id;
end;
$$;
