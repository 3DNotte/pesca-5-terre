-- Feedback anonimi degli utenti: nessun nome, nessun account, nessuna
-- coordinata precisa (solo id di settore ~500 m).
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  anon_id TEXT NOT NULL,          -- uuid casuale generato sul telefono, non collegabile a una persona
  kind TEXT NOT NULL,             -- 'bad_day' | 'catch'
  species TEXT,                   -- chiave specie dell'app
  sectors TEXT,                   -- JSON array di id settore (es. ["r12c30"])
  followed TEXT,                  -- 'spot1' | 'spot2' | 'spot3' | 'other' | NULL
  reasons TEXT,                   -- JSON array di motivi (mare_mosso, ...)
  note TEXT,                      -- breve nota libera (max 300 caratteri), letta da un umano
  local_time TEXT,                -- ISO locale dell'uscita
  app_version TEXT
);
CREATE INDEX IF NOT EXISTS idx_feedback_anon_time ON feedback (anon_id, created_at);
