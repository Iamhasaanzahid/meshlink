-- Pak Link reference schema (optional server-side persistence).
-- The demo stores everything in browser localStorage; this schema documents
-- the same entities for a SQLite/Postgres-backed deployment.

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  mesh_id       TEXT NOT NULL UNIQUE CHECK (length(mesh_id) = 10), -- app-assigned, never a phone number
  name          TEXT NOT NULL,
  about         TEXT DEFAULT '',
  avatar_url    TEXT,
  last_seen_at  INTEGER,
  created_at    INTEGER NOT NULL
);

CREATE TABLE contacts (
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alias         TEXT,
  blocked       INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  PRIMARY KEY (owner_id, contact_id)
);

CREATE TABLE chats (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL CHECK (type IN ('dm', 'group')),
  title         TEXT,
  peer_id       TEXT REFERENCES users(id),
  avatar_url    TEXT,
  pinned        INTEGER NOT NULL DEFAULT 0,
  muted         INTEGER NOT NULL DEFAULT 0,
  archived      INTEGER NOT NULL DEFAULT 0,
  created_by    TEXT REFERENCES users(id),
  created_at    INTEGER NOT NULL,
  last_at       INTEGER
);

CREATE TABLE chat_members (
  chat_id       TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  joined_at     INTEGER NOT NULL,
  PRIMARY KEY (chat_id, user_id)
);

CREATE TABLE messages (
  id            TEXT PRIMARY KEY,             -- client-generated unique id
  chat_id       TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_id     TEXT NOT NULL REFERENCES users(id),
  kind          TEXT NOT NULL DEFAULT 'text'
                CHECK (kind IN ('text', 'image', 'video', 'voice', 'doc', 'sticker', 'gif')),
  body          TEXT,
  media_url     TEXT,
  media_name    TEXT,
  duration      INTEGER,
  reply_to      TEXT REFERENCES messages(id) ON DELETE SET NULL,
  forwarded     INTEGER NOT NULL DEFAULT 0,
  starred       INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued', 'mesh', 'sent', 'delivered', 'read')),
  transport     TEXT NOT NULL DEFAULT 'outbox'
                CHECK (transport IN ('outbox', 'mesh', 'global')),
  expires_at    INTEGER,                       -- 24h TTL while queued
  created_at    INTEGER NOT NULL,
  edited_at     INTEGER,
  deleted_at    INTEGER
);

CREATE INDEX messages_chat_idx ON messages (chat_id, created_at);
CREATE INDEX messages_outbox_idx ON messages (status, expires_at);

-- Dedupe relayed messages that arrive from multiple paths.
CREATE UNIQUE INDEX messages_dedupe_idx ON messages (id);

CREATE TABLE reactions (
  message_id    TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji         TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE receipts (
  message_id    TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state         TEXT NOT NULL CHECK (state IN ('delivered', 'read')),
  at            INTEGER NOT NULL,
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE calls (
  id            TEXT PRIMARY KEY,
  peer_id       TEXT REFERENCES users(id),
  type          TEXT NOT NULL CHECK (type IN ('voice', 'video')),
  direction     TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  status        TEXT NOT NULL CHECK (status IN ('ringing', 'answered', 'missed', 'declined')),
  tier          TEXT NOT NULL CHECK (tier IN ('global', 'local', 'offline')),
  duration      INTEGER NOT NULL DEFAULT 0,
  started_at    INTEGER NOT NULL
);

CREATE TABLE statuses (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL
);

CREATE TABLE status_items (
  id            TEXT PRIMARY KEY,
  status_id     TEXT NOT NULL REFERENCES statuses(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('text', 'image', 'video')),
  text          TEXT,
  media_url     TEXT,
  background    TEXT,
  created_at    INTEGER NOT NULL
);

CREATE TABLE status_views (
  status_item_id TEXT NOT NULL REFERENCES status_items(id) ON DELETE CASCADE,
  viewer_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at      INTEGER NOT NULL,
  PRIMARY KEY (status_item_id, viewer_id)
);

CREATE TABLE ai_messages (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  body          TEXT NOT NULL,
  model         TEXT,
  created_at    INTEGER NOT NULL
);

CREATE TABLE outbox (
  id            TEXT PRIMARY KEY,
  chat_id       TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  message_id    TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  payload       TEXT NOT NULL,
  attempts      INTEGER NOT NULL DEFAULT 0,
  expires_at    INTEGER NOT NULL,
  created_at    INTEGER NOT NULL,
  UNIQUE (message_id)
);
