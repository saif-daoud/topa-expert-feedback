CREATE TABLE IF NOT EXISTS access_codes (
  code_hash TEXT PRIMARY KEY,
  active INTEGER NOT NULL DEFAULT 1,
  uses_remaining INTEGER,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  name TEXT,
  email TEXT,
  job_title TEXT,
  institution TEXT,
  latest_degree TEXT,
  years_experience INTEGER,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS followup_responses (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  comparison_id TEXT NOT NULL,
  component TEXT NOT NULL,
  sequence_index INTEGER NOT NULL,
  method_x_name TEXT NOT NULL,
  method_y_name TEXT NOT NULL,
  llm_consensus_winner TEXT,
  llm_consensus_detail TEXT,
  llm_all_runs_agree INTEGER NOT NULL DEFAULT 0,
  llm_supporting_runs INTEGER,
  llm_selected_run INTEGER,
  llm_selected_winner TEXT,
  llm_selected_reason TEXT,
  llm_selected_output_a_name TEXT,
  llm_selected_output_b_name TEXT,
  llm_selected_swap_order_in_prompt INTEGER NOT NULL DEFAULT 0,
  winner_choice TEXT NOT NULL CHECK (winner_choice IN ('method_x','method_y','tie')),
  expert_selected_method_name TEXT,
  expert_matches_llm_selected INTEGER,
  agreement_choice TEXT NOT NULL CHECK (agreement_choice IN ('completely_agree','mostly_agree','partially_agree','mostly_disagree','completely_disagree')),
  feedback TEXT,
  timestamp_utc TEXT NOT NULL,
  user_agent TEXT,
  page_url TEXT,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_followup_responses_participant ON followup_responses(participant_id);
CREATE INDEX IF NOT EXISTS idx_followup_responses_component ON followup_responses(component);
CREATE INDEX IF NOT EXISTS idx_followup_responses_component_sequence ON followup_responses(component, sequence_index);
