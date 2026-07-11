alter table general_notes
  add column if not exists unrecognized_intent_guess text;
