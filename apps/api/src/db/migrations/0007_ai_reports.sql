-- Rapports d'IA (docs/05, partie B). Figés : aucune mise à jour, aucune suppression par l'API.
CREATE TABLE ai_reports (
  id             INTEGER PRIMARY KEY,
  token_id       INTEGER NOT NULL REFERENCES tokens(id),
  created_at     INTEGER NOT NULL,
  provider       TEXT NOT NULL,
  model          TEXT,
  dossier_hash   TEXT NOT NULL,
  prompt_version INTEGER NOT NULL,
  content        TEXT NOT NULL,
  note           TEXT
);
CREATE INDEX idx_ai_reports_token ON ai_reports(token_id, created_at DESC);
