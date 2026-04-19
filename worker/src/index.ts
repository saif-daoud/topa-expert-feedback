import lowCoverageComparisonPool from "./data/low_coverage_comparisons_n_lt_3.json";

export type Env = {
  DB: D1Database;
  TOKEN_SECRET: string;
  ALLOWED_ORIGINS: string;
};

const JSON_HEADERS = { "Content-Type": "application/json" };
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TARGET_ASSIGNMENT_COUNT = 30;
const COMPONENT_ORDER = ["action_space", "conversation_state", "knowledge_graph", "cautions", "user_profile"];
const BLOCKED_ENTRY_EMAILS = new Set(["saif.sedaoud@gmail.com"]);
const BLOCKED_ENTRY_MESSAGE = "Please enter your email to continue.";

function cors(origin: string) {
  return {
    ...JSON_HEADERS,
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function originAllowed(env: Env, origin: string) {
  return (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(origin);
}

function base64UrlEncode(bytes: Uint8Array) {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacSign(secret: string, data: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return base64UrlEncode(new Uint8Array(signature));
}

function b64Json(obj: unknown) {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(obj)));
}

function fromB64Json(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function makeToken(env: Env, payload: unknown) {
  const body = b64Json(payload);
  const signature = await hmacSign(env.TOKEN_SECRET, body);
  return `${body}.${signature}`;
}

async function verifyToken(env: Env, token: string, opts?: { ignoreExp?: boolean }) {
  const [body, signature] = token.split(".");
  if (!body || !signature) throw new Error("Bad token format");
  const expected = await hmacSign(env.TOKEN_SECRET, body);
  if (expected !== signature) throw new Error("Bad token signature");
  const payload = fromB64Json(body);
  if (!opts?.ignoreExp && payload.exp && Date.now() > payload.exp) throw new Error("Token expired");
  return payload;
}

type AccessCodeRow = {
  code_hash: string;
  active: number;
  uses_remaining: number | null;
  expires_at: string | null;
};

type ParticipantLookupRow = {
  id: number;
  name: string | null;
  email: string | null;
  job_title: string | null;
  institution: string | null;
  latest_degree: string | null;
  years_experience: number | null;
};

type FollowupComparisonSeed = {
  comparison_id: string;
  component: string;
  "Method X": string;
  "Method Y": string;
  expert_n: number;
  llm_consensus_winner: string;
  llm_consensus_detail: string;
  llm_all_runs_agree: boolean;
  llm_supporting_runs: number;
  llm_selected_run: number;
  llm_selected_winner: string;
  llm_selected_swap_order_in_prompt: boolean;
  llm_selected_output_a: string;
  llm_selected_output_b: string;
  llm_selected_reason: string;
};

type FollowupAssignmentRow = {
  participant_id: string;
  comparison_id: string;
  assigned_order: number;
  component: string;
  source_expert_n: number;
  effective_expert_n: number;
  assigned_at: string;
};

type FollowupResponseRow = {
  id: string;
  participant_id: string;
  comparison_id: string;
  component: string;
  sequence_index: number;
  method_x_name: string;
  method_y_name: string;
  llm_consensus_winner: string | null;
  llm_consensus_detail: string | null;
  llm_all_runs_agree: number;
  llm_supporting_runs: number | null;
  llm_selected_run: number | null;
  llm_selected_winner: string | null;
  llm_selected_reason: string | null;
  llm_selected_output_a_name: string | null;
  llm_selected_output_b_name: string | null;
  llm_selected_swap_order_in_prompt: number;
  winner_choice: "method_x" | "method_y" | "tie";
  expert_selected_method_name: string | null;
  expert_matches_llm_selected: number | null;
  agreement_choice:
    | "completely_agree"
    | "mostly_agree"
    | "partially_agree"
    | "mostly_disagree"
    | "completely_disagree";
  issue_tags_json: string | null;
  feedback: string | null;
  source_expert_n: number | null;
  effective_expert_n: number | null;
  timestamp_utc: string;
  user_agent?: string | null;
  page_url?: string | null;
  received_at: string;
};

const COMPARISON_POOL: FollowupComparisonSeed[] = (Array.isArray(lowCoverageComparisonPool) ? lowCoverageComparisonPool : []).map((row: any) => ({
  comparison_id: sanitizeText(row?.comparison_id, 240),
  component: sanitizeText(row?.component, 120),
  "Method X": sanitizeText(row?.["Method X"], 200),
  "Method Y": sanitizeText(row?.["Method Y"], 200),
  expert_n: Number(row?.expert_n || 0),
  llm_consensus_winner: sanitizeText(row?.llm_consensus_winner, 200),
  llm_consensus_detail: sanitizeText(row?.llm_consensus_detail, 500),
  llm_all_runs_agree: Boolean(row?.llm_all_runs_agree),
  llm_supporting_runs: Number(row?.llm_supporting_runs || 0),
  llm_selected_run: Number(row?.llm_selected_run || 0),
  llm_selected_winner: sanitizeText(row?.llm_selected_winner, 200),
  llm_selected_swap_order_in_prompt: Boolean(row?.llm_selected_swap_order_in_prompt),
  llm_selected_output_a: sanitizeText(row?.llm_selected_output_a, 200),
  llm_selected_output_b: sanitizeText(row?.llm_selected_output_b, 200),
  llm_selected_reason: sanitizeText(row?.llm_selected_reason, 5000),
}));

const COMPARISON_POOL_BY_ID = new Map<string, FollowupComparisonSeed>(COMPARISON_POOL.map((row) => [row.comparison_id, row]));

async function dbGetAccessCode(env: Env, codeHash: string) {
  return (
    (await env.DB.prepare("SELECT code_hash, active, uses_remaining, expires_at FROM access_codes WHERE code_hash = ?").bind(codeHash).first<AccessCodeRow>()) ??
    null
  );
}

async function dbDecrementUsesRemaining(env: Env, codeHash: string) {
  await env.DB.prepare("UPDATE access_codes SET uses_remaining = uses_remaining - 1 WHERE code_hash = ? AND uses_remaining IS NOT NULL AND uses_remaining > 0").bind(codeHash).run();
}

function isProfileComplete(row: ParticipantLookupRow | null) {
  if (!row) return false;
  return Boolean(
    String(row.name || "").trim() &&
      String(row.email || "").trim() &&
      String(row.job_title || "").trim() &&
      String(row.institution || "").trim() &&
      String(row.latest_degree || "").trim() &&
      row.years_experience != null &&
      Number.isFinite(Number(row.years_experience))
  );
}

async function allocateParticipantId(env: Env, email?: string | null) {
  const createdAt = new Date().toISOString();
  const sanitizedEmail = sanitizeText(email, 320);
  const result = sanitizedEmail
    ? await env.DB.prepare("INSERT INTO participants (created_at, updated_at, email) VALUES (?, ?, ?)").bind(createdAt, createdAt, sanitizedEmail).run()
    : await env.DB.prepare("INSERT INTO participants (created_at) VALUES (?)").bind(createdAt).run();
  const id = Number(result?.meta?.last_row_id || 0);
  if (!Number.isFinite(id) || id <= 0) throw new Error("Failed to allocate participant id");
  return `P${String(id).padStart(5, "0")}`;
}

function parseParticipantId(participantId: string) {
  const match = /^P(\d+)$/.exec(String(participantId || ""));
  if (!match) throw new Error("Invalid participant_id");
  return parseInt(match[1], 10);
}

function sanitizeText(value: unknown, maxLen: number) {
  const text = String(value ?? "").trim();
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

function isBlockedEntryEmail(email: string) {
  return BLOCKED_ENTRY_EMAILS.has(String(email || "").trim().toLowerCase());
}

function normalizeMethodName(value: string) {
  return (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeWinnerChoice(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "method_x") return "method_x";
  if (normalized === "method_y") return "method_y";
  if (normalized === "tie") return "tie";
  throw new Error("winner_choice must be one of: method_x / method_y / tie");
}

function normalizeAgreementChoice(value: string): FollowupResponseRow["agreement_choice"] {
  const normalized = value.trim().toLowerCase();
  const allowed = new Set(["completely_agree", "mostly_agree", "partially_agree", "mostly_disagree", "completely_disagree"]);
  if (!allowed.has(normalized)) throw new Error("Invalid agreement_choice");
  return normalized as FollowupResponseRow["agreement_choice"];
}

function normalizeIssueTag(value: string) {
  const normalized = value.trim().toLowerCase();
  const allowed = new Set(["incomplete", "vague_non_operational", "poorly_structured", "irrelevant", "low_practical_utility"]);
  if (!allowed.has(normalized)) throw new Error(`Invalid issue tag: ${value}`);
  return normalized;
}

function deriveAgreementChoice(winnerChoice: FollowupResponseRow["winner_choice"], llmWinner: string, methodXName: string, methodYName: string): FollowupResponseRow["agreement_choice"] {
  const normalizedLlmWinner = normalizeMethodName(llmWinner);
  const normalizedMethodX = normalizeMethodName(methodXName);
  const normalizedMethodY = normalizeMethodName(methodYName);
  const llmChoice =
    normalizedLlmWinner === normalizedMethodX ? "method_x" : normalizedLlmWinner === normalizedMethodY ? "method_y" : ("tie" as FollowupResponseRow["winner_choice"]);

  if (winnerChoice === "tie" || llmChoice === "tie") return "partially_agree";
  if (winnerChoice === llmChoice) return "mostly_agree";
  return "mostly_disagree";
}

function componentRank(component: string) {
  const idx = COMPONENT_ORDER.indexOf(component);
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

function targetAssignmentCount() {
  return Math.min(TARGET_ASSIGNMENT_COUNT, COMPARISON_POOL.length);
}

function buildComparisonPayload(seed: FollowupComparisonSeed, assignment: FollowupAssignmentRow) {
  return {
    ...seed,
    expert_n: assignment.source_expert_n,
    effective_expert_n: assignment.effective_expert_n,
    sequence_index: assignment.assigned_order,
  };
}

async function dbFindParticipantByEmail(env: Env, email: string) {
  const normalized = String(email || "").trim();
  if (!normalized) return null;

  const row = await env.DB
    .prepare(
      "SELECT p.id AS id, p.name AS name, p.email AS email, p.job_title AS job_title, p.institution AS institution, p.latest_degree AS latest_degree, p.years_experience AS years_experience FROM participants p LEFT JOIN followup_responses r ON r.participant_id = printf('P%05d', p.id) WHERE p.email IS NOT NULL AND TRIM(p.email) != '' AND lower(p.email) = lower(?) GROUP BY p.id ORDER BY COUNT(r.id) DESC, COALESCE(p.updated_at, p.created_at) DESC, p.id DESC LIMIT 1"
    )
    .bind(normalized)
    .first<ParticipantLookupRow>();

  const id = Number(row?.id || 0);
  if (!Number.isFinite(id) || id <= 0) return null;

  return {
    participant_id: `P${String(id).padStart(5, "0")}`,
    profile_complete: isProfileComplete(row),
  };
}

async function dbUpdateParticipantProfile(env: Env, participantId: string, profile: any) {
  const id = parseParticipantId(participantId);
  const years = Number(String(profile?.years_experience ?? "").trim());
  if (!Number.isFinite(years) || years < 0 || years > 80) throw new Error("Invalid years_experience");

  await env.DB
    .prepare(
      `UPDATE participants
       SET name=?, email=?, job_title=?, institution=?, latest_degree=?, years_experience=?, updated_at=?
       WHERE id=?`
    )
    .bind(
      sanitizeText(profile?.name, 200),
      sanitizeText(profile?.email, 320),
      sanitizeText(profile?.job_title, 200),
      sanitizeText(profile?.institution, 250),
      sanitizeText(profile?.latest_degree, 200),
      years,
      new Date().toISOString(),
      id
    )
    .run();
}

async function dbListParticipantResponses(env: Env, participantId: string) {
  const rows = await env.DB
    .prepare("SELECT * FROM followup_responses WHERE participant_id = ? ORDER BY sequence_index ASC, timestamp_utc ASC, comparison_id ASC")
    .bind(participantId)
    .all<FollowupResponseRow>();

  return rows?.results || [];
}

async function dbListParticipantAssignments(env: Env, participantId: string) {
  const rows = await env.DB
    .prepare("SELECT * FROM followup_assignments WHERE participant_id = ? ORDER BY assigned_order ASC, comparison_id ASC")
    .bind(participantId)
    .all<FollowupAssignmentRow>();

  return rows?.results || [];
}

async function dbGetParticipantAssignment(env: Env, participantId: string, comparisonId: string) {
  return (
    (await env.DB
      .prepare("SELECT * FROM followup_assignments WHERE participant_id = ? AND comparison_id = ? LIMIT 1")
      .bind(participantId, comparisonId)
      .first<FollowupAssignmentRow>()) ?? null
  );
}

async function dbGetResponseCountsByComparison(env: Env) {
  const rows = await env.DB
    .prepare("SELECT comparison_id, COUNT(*) AS n FROM followup_responses GROUP BY comparison_id")
    .all<{ comparison_id: string; n: number }>();

  return new Map<string, number>((rows?.results || []).map((row) => [String(row.comparison_id || ""), Number(row.n || 0)]));
}

async function dbGetOpenAssignmentCountsByComparison(env: Env) {
  const rows = await env.DB
    .prepare(
      `SELECT a.comparison_id AS comparison_id, COUNT(*) AS n
       FROM followup_assignments a
       LEFT JOIN followup_responses r
         ON r.participant_id = a.participant_id
        AND r.comparison_id = a.comparison_id
       WHERE r.id IS NULL
       GROUP BY a.comparison_id`
    )
    .all<{ comparison_id: string; n: number }>();

  return new Map<string, number>((rows?.results || []).map((row) => [String(row.comparison_id || ""), Number(row.n || 0)]));
}

async function dbUpsertAssignment(env: Env, row: FollowupAssignmentRow) {
  await env.DB
    .prepare(
      `INSERT INTO followup_assignments (
         participant_id, comparison_id, assigned_order, component,
         source_expert_n, effective_expert_n, assigned_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(participant_id, comparison_id) DO UPDATE SET
         assigned_order=excluded.assigned_order,
         component=excluded.component,
         source_expert_n=excluded.source_expert_n,
         effective_expert_n=excluded.effective_expert_n,
         assigned_at=excluded.assigned_at`
    )
    .bind(
      row.participant_id,
      row.comparison_id,
      row.assigned_order,
      row.component,
      row.source_expert_n,
      row.effective_expert_n,
      row.assigned_at
    )
    .run();
}

function comparisonCoverageForAssignment(seed: FollowupComparisonSeed, responseCounts: Map<string, number>, openAssignmentCounts: Map<string, number>) {
  return seed.expert_n + (responseCounts.get(seed.comparison_id) || 0) + (openAssignmentCounts.get(seed.comparison_id) || 0);
}

function comparisonSelectionSort(
  a: FollowupComparisonSeed & { effective_expert_n: number },
  b: FollowupComparisonSeed & { effective_expert_n: number }
) {
  const effectiveDiff = a.effective_expert_n - b.effective_expert_n;
  if (effectiveDiff !== 0) return effectiveDiff;

  const sourceDiff = a.expert_n - b.expert_n;
  if (sourceDiff !== 0) return sourceDiff;

  const componentDiff = componentRank(a.component) - componentRank(b.component);
  if (componentDiff !== 0) return componentDiff;

  return a.comparison_id.localeCompare(b.comparison_id);
}

async function ensureParticipantAssignments(env: Env, participantId: string) {
  const wanted = targetAssignmentCount();
  let assignments = await dbListParticipantAssignments(env, participantId);
  if (assignments.length >= wanted) return assignments.slice(0, wanted);

  const [existingResponses, responseCounts, openAssignmentCounts] = await Promise.all([
    dbListParticipantResponses(env, participantId),
    dbGetResponseCountsByComparison(env),
    dbGetOpenAssignmentCountsByComparison(env),
  ]);

  const usedIds = new Set(assignments.map((row) => row.comparison_id));
  let nextOrder = assignments.reduce((maxValue, row) => Math.max(maxValue, Number(row.assigned_order || 0)), 0) + 1;
  const newAssignments: FollowupAssignmentRow[] = [];

  for (const response of existingResponses) {
    if (assignments.length + newAssignments.length >= wanted) break;
    const seed = COMPARISON_POOL_BY_ID.get(String(response.comparison_id || ""));
    if (!seed || usedIds.has(seed.comparison_id)) continue;

    usedIds.add(seed.comparison_id);
    newAssignments.push({
      participant_id: participantId,
      comparison_id: seed.comparison_id,
      assigned_order: nextOrder++,
      component: seed.component,
      source_expert_n: seed.expert_n,
      effective_expert_n: comparisonCoverageForAssignment(seed, responseCounts, openAssignmentCounts),
      assigned_at: new Date().toISOString(),
    });
  }

  if (assignments.length + newAssignments.length < wanted) {
    const remainingCandidates = COMPARISON_POOL
      .filter((seed) => !usedIds.has(seed.comparison_id))
      .map((seed) => ({
        ...seed,
        effective_expert_n: comparisonCoverageForAssignment(seed, responseCounts, openAssignmentCounts),
      }))
      .sort(comparisonSelectionSort);

    for (const seed of remainingCandidates) {
      if (assignments.length + newAssignments.length >= wanted) break;
      usedIds.add(seed.comparison_id);
      newAssignments.push({
        participant_id: participantId,
        comparison_id: seed.comparison_id,
        assigned_order: nextOrder++,
        component: seed.component,
        source_expert_n: seed.expert_n,
        effective_expert_n: seed.effective_expert_n,
        assigned_at: new Date().toISOString(),
      });
    }
  }

  for (const row of newAssignments) {
    await dbUpsertAssignment(env, row);
  }

  assignments = await dbListParticipantAssignments(env, participantId);
  return assignments.slice(0, wanted);
}

async function dbUpsertResponse(env: Env, row: FollowupResponseRow) {
  await env.DB
    .prepare(
      `INSERT INTO followup_responses (
         id, participant_id, comparison_id, component, sequence_index,
         method_x_name, method_y_name,
         llm_consensus_winner, llm_consensus_detail, llm_all_runs_agree, llm_supporting_runs,
         llm_selected_run, llm_selected_winner, llm_selected_reason,
         llm_selected_output_a_name, llm_selected_output_b_name, llm_selected_swap_order_in_prompt,
         winner_choice, expert_selected_method_name, expert_matches_llm_selected,
         agreement_choice, issue_tags_json, feedback, source_expert_n, effective_expert_n,
         timestamp_utc, user_agent, page_url, received_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         participant_id=excluded.participant_id,
         comparison_id=excluded.comparison_id,
         component=excluded.component,
         sequence_index=excluded.sequence_index,
         method_x_name=excluded.method_x_name,
         method_y_name=excluded.method_y_name,
         llm_consensus_winner=excluded.llm_consensus_winner,
         llm_consensus_detail=excluded.llm_consensus_detail,
         llm_all_runs_agree=excluded.llm_all_runs_agree,
         llm_supporting_runs=excluded.llm_supporting_runs,
         llm_selected_run=excluded.llm_selected_run,
         llm_selected_winner=excluded.llm_selected_winner,
         llm_selected_reason=excluded.llm_selected_reason,
         llm_selected_output_a_name=excluded.llm_selected_output_a_name,
         llm_selected_output_b_name=excluded.llm_selected_output_b_name,
         llm_selected_swap_order_in_prompt=excluded.llm_selected_swap_order_in_prompt,
         winner_choice=excluded.winner_choice,
         expert_selected_method_name=excluded.expert_selected_method_name,
         expert_matches_llm_selected=excluded.expert_matches_llm_selected,
         agreement_choice=excluded.agreement_choice,
         issue_tags_json=excluded.issue_tags_json,
         feedback=excluded.feedback,
         source_expert_n=excluded.source_expert_n,
         effective_expert_n=excluded.effective_expert_n,
         timestamp_utc=excluded.timestamp_utc,
         user_agent=excluded.user_agent,
         page_url=excluded.page_url,
         received_at=excluded.received_at`
    )
    .bind(
      row.id,
      row.participant_id,
      row.comparison_id,
      row.component,
      row.sequence_index,
      row.method_x_name,
      row.method_y_name,
      row.llm_consensus_winner,
      row.llm_consensus_detail,
      row.llm_all_runs_agree,
      row.llm_supporting_runs,
      row.llm_selected_run,
      row.llm_selected_winner,
      row.llm_selected_reason,
      row.llm_selected_output_a_name,
      row.llm_selected_output_b_name,
      row.llm_selected_swap_order_in_prompt,
      row.winner_choice,
      row.expert_selected_method_name,
      row.expert_matches_llm_selected,
      row.agreement_choice,
      row.issue_tags_json,
      row.feedback,
      row.source_expert_n,
      row.effective_expert_n,
      row.timestamp_utc,
      row.user_agent ?? null,
      row.page_url ?? null,
      row.received_at
    )
    .run();
}

function toResponseRow(response: any, participant_id: string, req: Request, assignment?: FollowupAssignmentRow | null): FollowupResponseRow {
  const winner_choice = normalizeWinnerChoice(String(response.winner_choice || ""));
  const expert_selected_method_name =
    winner_choice === "method_x" ? sanitizeText(response.method_x_name, 200) : winner_choice === "method_y" ? sanitizeText(response.method_y_name, 200) : null;
  const llmWinner = sanitizeText(response.llm_selected_winner || response.llm_consensus_winner, 200);
  const expert_matches_llm_selected =
    expert_selected_method_name == null ? null : normalizeMethodName(expert_selected_method_name) === normalizeMethodName(llmWinner) ? 1 : 0;
  const comparison_id = sanitizeText(response.comparison_id, 240);
  const seed = COMPARISON_POOL_BY_ID.get(comparison_id);
  const issueTags = Array.isArray(response.issue_tags) ? Array.from(new Set(response.issue_tags.map((value: any) => normalizeIssueTag(String(value))))) : [];
  if (issueTags.length === 0) throw new Error("At least one issue must be selected");
  const normalizedFeedback = sanitizeText(response.feedback, 5000);
  const agreement_choice = deriveAgreementChoice(winner_choice, llmWinner, sanitizeText(response.method_x_name, 200), sanitizeText(response.method_y_name, 200));

  return {
    id: String(response.id || crypto.randomUUID()),
    participant_id,
    comparison_id,
    component: assignment?.component || sanitizeText(response.component || seed?.component, 120),
    sequence_index: assignment?.assigned_order || Number(response.sequence_index || 0),
    method_x_name: sanitizeText(response.method_x_name, 200),
    method_y_name: sanitizeText(response.method_y_name, 200),
    llm_consensus_winner: sanitizeText(response.llm_consensus_winner, 200) || null,
    llm_consensus_detail: sanitizeText(response.llm_consensus_detail, 500) || null,
    llm_all_runs_agree: Number(response.llm_all_runs_agree ? 1 : 0),
    llm_supporting_runs: response.llm_supporting_runs == null ? null : Number(response.llm_supporting_runs),
    llm_selected_run: response.llm_selected_run == null ? null : Number(response.llm_selected_run),
    llm_selected_winner: sanitizeText(response.llm_selected_winner, 200) || null,
    llm_selected_reason: sanitizeText(response.llm_selected_reason, 5000) || null,
    llm_selected_output_a_name: sanitizeText(response.llm_selected_output_a_name, 200) || null,
    llm_selected_output_b_name: sanitizeText(response.llm_selected_output_b_name, 200) || null,
    llm_selected_swap_order_in_prompt: Number(response.llm_selected_swap_order_in_prompt ? 1 : 0),
    winner_choice,
    expert_selected_method_name,
    expert_matches_llm_selected,
    agreement_choice,
    issue_tags_json: JSON.stringify(issueTags),
    feedback: normalizedFeedback || null,
    source_expert_n: assignment?.source_expert_n ?? (seed ? seed.expert_n : null),
    effective_expert_n: assignment?.effective_expert_n ?? null,
    timestamp_utc: String(response.timestamp_utc || new Date().toISOString()),
    user_agent: response.user_agent ? String(response.user_agent) : req.headers.get("user-agent") || "",
    page_url: response.page_url ? String(response.page_url) : "",
    received_at: new Date().toISOString(),
  };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get("Origin") || "";
    const allowed = originAllowed(env, origin);
    const headers = cors(origin);

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: allowed ? headers : {} });
    if (!allowed) return new Response(JSON.stringify({ error: "Origin not allowed" }), { status: 403, headers: JSON_HEADERS });
    if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });

    const path = new URL(req.url).pathname;

    if (path.endsWith("/api/start")) {
      const body = await req.json().catch(() => ({}));
      const code = String(body.code || "").trim();
      const email = sanitizeText(body.email, 320);
      if (!code) return new Response(JSON.stringify({ error: "Missing code" }), { status: 400, headers });
      if (email && isBlockedEntryEmail(email)) {
        return new Response(JSON.stringify({ error: BLOCKED_ENTRY_MESSAGE }), { status: 400, headers });
      }

      const codeHash = await sha256Hex(code);
      const accessCode = await dbGetAccessCode(env, codeHash);
      if (!accessCode) return new Response(JSON.stringify({ error: "Invalid code" }), { status: 403, headers });
      if (accessCode.active !== 1) return new Response(JSON.stringify({ error: "Code inactive" }), { status: 403, headers });
      if (accessCode.expires_at && Date.now() > Date.parse(accessCode.expires_at)) {
        return new Response(JSON.stringify({ error: "Code expired" }), { status: 403, headers });
      }

      const existingParticipant = email ? await dbFindParticipantByEmail(env, email) : null;
      if (existingParticipant) {
        const token = await makeToken(env, { codeHash, participant_id: existingParticipant.participant_id, exp: Date.now() + TOKEN_TTL_MS });
        return new Response(
          JSON.stringify({
            ok: true,
            token,
            participant_id: existingParticipant.participant_id,
            resumed: existingParticipant.profile_complete,
            profile_complete: existingParticipant.profile_complete,
            prefill_email: email,
          }),
          { status: 200, headers }
        );
      }

      if (accessCode.uses_remaining !== null && accessCode.uses_remaining <= 0) {
        return new Response(JSON.stringify({ error: "Code has no remaining uses" }), { status: 403, headers });
      }

      if (accessCode.uses_remaining !== null) await dbDecrementUsesRemaining(env, codeHash);

      const participant_id = await allocateParticipantId(env, email || null);
      const token = await makeToken(env, { codeHash, participant_id, exp: Date.now() + TOKEN_TTL_MS });
      return new Response(JSON.stringify({ ok: true, token, participant_id, resumed: false, profile_complete: false, prefill_email: email || null }), { status: 200, headers });
    }

    if (path.endsWith("/api/profile")) {
      const body: any = await req.json().catch(() => ({}));
      if (!body?.token || !body?.profile) return new Response(JSON.stringify({ error: "Missing token or profile" }), { status: 400, headers });
      const requestedEmail = sanitizeText(body.profile?.email, 320);
      if (requestedEmail && isBlockedEntryEmail(requestedEmail)) {
        return new Response(JSON.stringify({ error: BLOCKED_ENTRY_MESSAGE }), { status: 400, headers });
      }

      let payload: any;
      try {
        payload = await verifyToken(env, String(body.token));
      } catch {
        return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers });
      }

      const currentParticipantId = String(payload.participant_id || "");
      const codeHash = String(payload.codeHash || "");
      const existingParticipant = await dbFindParticipantByEmail(env, requestedEmail);
      const participant_id = existingParticipant?.participant_id || currentParticipantId;

      try {
        await dbUpdateParticipantProfile(env, participant_id, body.profile);
      } catch (error: any) {
        return new Response(JSON.stringify({ error: error?.message || "Invalid profile" }), { status: 400, headers });
      }

      const token =
        participant_id === currentParticipantId ? String(body.token) : await makeToken(env, { codeHash, participant_id, exp: Date.now() + TOKEN_TTL_MS });

      return new Response(JSON.stringify({ ok: true, participant_id, token, reused: participant_id !== currentParticipantId }), { headers });
    }

    if (path.endsWith("/api/refresh")) {
      const body: any = await req.json().catch(() => ({}));
      if (!body?.token) return new Response(JSON.stringify({ error: "Missing token" }), { status: 400, headers });

      let payload: any;
      try {
        payload = await verifyToken(env, String(body.token), { ignoreExp: true });
      } catch {
        return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers });
      }

      const participant_id = String(payload.participant_id || "");
      const codeHash = String(payload.codeHash || "");
      const token = await makeToken(env, { codeHash, participant_id, exp: Date.now() + TOKEN_TTL_MS });
      return new Response(JSON.stringify({ ok: true, participant_id, token }), { headers });
    }

    if (path.endsWith("/api/assigned-comparisons")) {
      const body: any = await req.json().catch(() => ({}));
      if (!body?.token) return new Response(JSON.stringify({ error: "Missing token" }), { status: 400, headers });

      let payload: any;
      try {
        payload = await verifyToken(env, String(body.token));
      } catch {
        return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers });
      }

      const participant_id = String(payload.participant_id || "");
      const comparisons = (await ensureParticipantAssignments(env, participant_id))
        .map((assignment) => {
          const seed = COMPARISON_POOL_BY_ID.get(assignment.comparison_id);
          return seed ? buildComparisonPayload(seed, assignment) : null;
        })
        .filter(Boolean);

      return new Response(
        JSON.stringify({
          ok: true,
          target_count: targetAssignmentCount(),
          pool_size: COMPARISON_POOL.length,
          comparisons,
        }),
        { headers }
      );
    }

    if (path.endsWith("/api/history")) {
      const body: any = await req.json().catch(() => ({}));
      if (!body?.token) return new Response(JSON.stringify({ error: "Missing token" }), { status: 400, headers });

      let payload: any;
      try {
        payload = await verifyToken(env, String(body.token));
      } catch {
        return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers });
      }

      const rows = await dbListParticipantResponses(env, String(payload.participant_id || ""));
      return new Response(JSON.stringify({ ok: true, responses: rows }), { headers });
    }

    if (path.endsWith("/api/sync")) {
      const body: any = await req.json().catch(() => ({}));
      if (!body?.token || !Array.isArray(body?.responses)) return new Response(JSON.stringify({ error: "Missing token or responses" }), { status: 400, headers });

      let payload: any;
      try {
        payload = await verifyToken(env, String(body.token));
      } catch {
        return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers });
      }

      const participant_id = String(payload.participant_id || "");
      const responses = body.responses.slice(0, 500);
      const saved_ids: string[] = [];
      const failed: { id: string; error: string }[] = [];

      for (const response of responses) {
        const responseId = String(response?.id || "");
        try {
          if (String(response?.participant_id || "") !== participant_id) throw new Error("participant_id mismatch");
          const assignment = await dbGetParticipantAssignment(env, participant_id, sanitizeText(response?.comparison_id, 240));
          const row = toResponseRow(response, participant_id, req, assignment);
          await dbUpsertResponse(env, row);
          saved_ids.push(String(row.id));
        } catch (error: any) {
          failed.push({ id: responseId, error: error?.message || "Upload failed" });
        }
      }

      return new Response(JSON.stringify({ ok: failed.length === 0, saved_ids, failed }), { headers });
    }

    if (path.endsWith("/api/response")) {
      const body: any = await req.json().catch(() => ({}));
      if (!body?.token || !body?.response) return new Response(JSON.stringify({ error: "Missing token or response" }), { status: 400, headers });

      let payload: any;
      try {
        payload = await verifyToken(env, String(body.token));
      } catch {
        return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers });
      }

      const participant_id = String(payload.participant_id || "");
      const response = body.response as any;
      if (String(response.participant_id || "") !== participant_id) {
        return new Response(JSON.stringify({ error: "participant_id mismatch" }), { status: 403, headers });
      }

      let row: FollowupResponseRow;
      try {
        const assignment = await dbGetParticipantAssignment(env, participant_id, sanitizeText(response?.comparison_id, 240));
        row = toResponseRow(response, participant_id, req, assignment);
      } catch (error: any) {
        return new Response(JSON.stringify({ error: error?.message || "Invalid response" }), { status: 400, headers });
      }

      await dbUpsertResponse(env, row);
      return new Response(JSON.stringify({ ok: true, id: row.id }), { headers });
    }

    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers });
  },
};
