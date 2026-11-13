-- Decision 0021: a draft saved while editing a published entry remembers which
-- version of the file it started from (its blob sha on main), so it reopens in
-- edit mode and Publish can tell when the entry changed on GitHub meanwhile.
-- '' for a draft of a new entry.
ALTER TABLE drafts ADD COLUMN base_sha TEXT NOT NULL DEFAULT '';
