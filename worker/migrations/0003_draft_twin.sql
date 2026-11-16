-- Decision 0029: a draft of an entry's other-language version, written from the entry itself (its slug fixed, its
-- photos carried over), remembers that, so it reopens in the same form. 0 for a new entry or an edit.
ALTER TABLE drafts ADD COLUMN twin INTEGER NOT NULL DEFAULT 0;
