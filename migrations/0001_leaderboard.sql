CREATE TABLE games (
  id TEXT PRIMARY KEY,
  size INTEGER NOT NULL CHECK (size IN (3, 4, 5)),
  mode TEXT NOT NULL CHECK (mode IN ('number', 'picture')),
  board_json TEXT NOT NULL,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);

CREATE INDEX games_expiry_idx ON games (expires_at);

CREATE TABLE scores (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL UNIQUE REFERENCES games (id),
  player_name TEXT NOT NULL,
  size INTEGER NOT NULL CHECK (size IN (3, 4, 5)),
  mode TEXT NOT NULL CHECK (mode IN ('number', 'picture')),
  time_seconds INTEGER NOT NULL CHECK (time_seconds > 0),
  moves INTEGER NOT NULL CHECK (moves > 0),
  created_at INTEGER NOT NULL
);

CREATE INDEX scores_leaderboard_idx
ON scores (size, mode, time_seconds, moves, created_at, id);
