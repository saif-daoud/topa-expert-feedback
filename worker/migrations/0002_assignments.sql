CREATE TABLE IF NOT EXISTS followup_assignments (
  participant_id TEXT NOT NULL,
  comparison_id TEXT NOT NULL,
  assigned_order INTEGER NOT NULL,
  component TEXT NOT NULL,
  source_expert_n INTEGER NOT NULL DEFAULT 0,
  effective_expert_n INTEGER NOT NULL DEFAULT 0,
  assigned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (participant_id, comparison_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_followup_assignments_participant_order
  ON followup_assignments(participant_id, assigned_order);

CREATE INDEX IF NOT EXISTS idx_followup_assignments_comparison
  ON followup_assignments(comparison_id);

ALTER TABLE followup_responses ADD COLUMN source_expert_n INTEGER;
ALTER TABLE followup_responses ADD COLUMN effective_expert_n INTEGER;
