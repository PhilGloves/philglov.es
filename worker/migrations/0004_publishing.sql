-- Final review T2-03: one Publish of an entry file at a time. A row while its pull request is being opened, removed
-- once it is; a row older than two minutes (a request that died) is taken over. Holds the file path, nothing personal.
CREATE TABLE publishing (path TEXT PRIMARY KEY, started_at INTEGER NOT NULL);
