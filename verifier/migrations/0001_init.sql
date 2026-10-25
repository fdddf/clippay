-- CampaignPool contract events, indexed by the verifier's Durable Object.
-- Amounts are stored as decimal strings (i128 doesn't fit in SQLite integers).
CREATE TABLE events (
  id TEXT PRIMARY KEY,          -- RPC event id (ledger order)
  ledger INTEGER NOT NULL,
  ts INTEGER NOT NULL,          -- ledger close time, unix seconds
  tx TEXT NOT NULL,
  type TEXT NOT NULL,           -- campaign_created | submitted | settled | refunded | topped_up | ...
  campaign INTEGER,
  address TEXT,                 -- brand, creator or funder, depending on type
  amount TEXT,
  fee TEXT,
  views TEXT,
  data TEXT                     -- the full event as JSON
);
CREATE INDEX events_campaign ON events (campaign, ledger);
CREATE INDEX events_address ON events (address, ledger);
CREATE INDEX events_type ON events (type, ledger);

-- Indexer cursor and other small settings.
CREATE TABLE kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);

-- Content-addressed campaign briefs: the id is the SHA-256 of the canonical JSON,
-- so a campaign whose on-chain brief URL names a hash can't be edited.
CREATE TABLE briefs (
  hash TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  created INTEGER NOT NULL
);

-- Content-addressed images (brand logos, avatars).
CREATE TABLE media (
  hash TEXT PRIMARY KEY,
  mime TEXT NOT NULL,
  body BLOB NOT NULL,
  created INTEGER NOT NULL
);

-- Briefs attached after creation by the campaign's brand (signed in).
CREATE TABLE campaign_meta (
  campaign INTEGER PRIMARY KEY,
  brief TEXT NOT NULL REFERENCES briefs (hash),
  set_by TEXT NOT NULL,
  updated INTEGER NOT NULL
);

-- Display names and avatars, editable by the account owner (signed in).
CREATE TABLE profiles (
  address TEXT PRIMARY KEY,
  name TEXT,
  avatar TEXT,                  -- media hash
  bio TEXT,
  updated INTEGER NOT NULL
);

-- One-time sign-in challenges.
CREATE TABLE challenges (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  expires INTEGER NOT NULL
);
