-- Editable internal documents.
--
-- One row per document, keyed by the path it is served at. A table rather than
-- a constant in the code because the whole point is that it can be edited from
-- the browser without a deploy — and a deploy is exactly what a contributor
-- brief should not need, since the people most likely to correct it are the
-- ones who have just been confused by it.
--
-- There is deliberately no seed row here. The route falls back to a default
-- body compiled into the Worker when the table is empty, so a fresh clone shows
-- the document immediately and the first save is what creates the row. That
-- keeps the whole brief out of a SQL string literal, where every apostrophe in
-- it would be an escaping problem.
CREATE TABLE IF NOT EXISTS internal_docs (
  slug       TEXT PRIMARY KEY,          -- "contribute"
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,             -- markdown, rendered by lib/markdown.ts
  updated_at INTEGER NOT NULL,
  -- Who saved last. An email rather than a user id: this is read by a person
  -- looking at a byline, and it should survive the account being deleted.
  updated_by TEXT
);
