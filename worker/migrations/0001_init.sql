-- B1: the four tables of the brief (docs/guide.md, Backend prompt, item 1).
-- Times are Unix milliseconds (Date.now()). Text is stored exactly as typed
-- (plain text, never HTML) and escaped on output.
-- The database is created in the EU jurisdiction (docs/setup.md); that cannot
-- be changed later.

-- One thread per slug, shown on both language versions of the entry.
-- `lang` records which version the comment was written on.
CREATE TABLE comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  lang TEXT NOT NULL CHECK (lang IN ('en', 'it')),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at INTEGER NOT NULL,
  -- SHA-256 of IP + secret salt; set to NULL after 30 days (retention job).
  ip_hash TEXT,
  reply_body TEXT
);
CREATE INDEX comments_by_slug ON comments (slug, status, created_at);
CREATE INDEX comments_by_status ON comments (status, created_at);
CREATE INDEX comments_by_email ON comments (email);

CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_url TEXT NOT NULL,
  message TEXT NOT NULL,
  email TEXT,
  created_at INTEGER NOT NULL,
  ip_hash TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  -- Added to the brief's columns: retention counts 12 months from this moment.
  done_at INTEGER
);
CREATE INDEX reports_by_status ON reports (status, created_at);

-- key = ip_hash; one row per address hash, a 10-minute window.
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);

-- Server-side drafts from /admin/write. `tags` and `photos` are JSON arrays;
-- `description` is added because the content schema requires one.
CREATE TABLE drafts (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL DEFAULT '',
  lang TEXT NOT NULL CHECK (lang IN ('en', 'it')),
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  photos TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL
);
