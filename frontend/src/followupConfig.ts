export type Descriptions = Record<string, string>;

export type MethodCatalog = {
  id: string;
  key: string;
  name: string;
  file: string;
  aliases: string[];
};

export type FollowupComparison = {
  comparison_id: string;
  component: string;
  "Method X": string;
  "Method Y": string;
  expert_n: number;
  effective_expert_n?: number | null;
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
  expert_followup_winner_choice?: string;
  expert_followup_agreement_choice?: string;
  expert_followup_feedback?: string;
  sequence_index: number;
};

export type AgreementChoice =
  | "completely_agree"
  | "mostly_agree"
  | "partially_agree"
  | "mostly_disagree"
  | "completely_disagree";

export type WinnerChoice = "method_x" | "method_y" | "tie";

export type IssueTag =
  | "incomplete"
  | "vague_non_operational"
  | "poorly_structured"
  | "irrelevant"
  | "low_practical_utility";

export type FollowupResponse = {
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
  winner_choice: WinnerChoice;
  expert_selected_method_name: string | null;
  expert_matches_llm_selected: number | null;
  agreement_choice?: AgreementChoice;
  issue_tags?: IssueTag[];
  issue_tags_json?: string | null;
  feedback: string | null;
  source_expert_n?: number | null;
  effective_expert_n?: number | null;
  timestamp_utc: string;
  user_agent?: string;
  page_url?: string;
  received_at?: string;
  synced?: boolean;
  sync_error?: string | null;
  synced_at_utc?: string | null;
};

export const API_BASE = import.meta.env.VITE_API_BASE as string;

export const BASE_URL = import.meta.env.BASE_URL;
export const BASENAME = BASE_URL.endsWith("/") ? BASE_URL.slice(0, -1) : BASE_URL;

export const STORAGE_KEYS = {
  token: "topa_expert_feedback_token",
  participantId: "topa_expert_feedback_pid",
  profileDone: "topa_expert_feedback_profile_done",
  responses: "topa_expert_feedback_responses",
};

export const FOLLOWUP_ASSIGNMENT_TARGET = 30;

export const COMPONENT_ORDER = ["action_space", "conversation_state", "knowledge_graph", "cautions", "user_profile"];

export const APP_DESC = `
<strong>Welcome, and thank you for contributing your expertise to this study.</strong><br><br>
We are developing an AI system designed to <strong>simulate a mental health provider delivering Cognitive Behavioral Therapy (CBT).</strong><br>
To do this responsibly, we automatically extract key components of CBT interventions from clinical textbooks. Your role is to help us evaluate the quality of these extracted components.<br><br>
In this study, you will review three types of outputs the system generates:<br>
    <strong>1. Macro Actions –</strong> high-level therapeutic moves (e.g., cognitive restructuring, problem-solving, agenda setting).<br>
    <strong>2. Micro Actions –</strong> are directly actionable at the utterance level and realize the underlying macro action.<br>
    <strong>3. Conversation State –</strong> the system’s moment-to-moment understanding of the client’s thoughts, feelings, behaviors, and therapeutic progress.<br>
    <strong>4. Knowledge Graph –</strong> structured clinical concepts and their relationships, used to guide the AI’s reasoning and intervention planning.<br>
    <strong>5. Cautions –</strong> warnings or risks that describe what the therapist should *not* do during a cognitive behavioral therapy session with the patient.<br>
    <strong>6. User Profile –</strong> stable patient attributes that shape how the patient typically thinks, feels, behaves, and engages in cognitive behavioral therapy session with the therapist that help simulate realistic responses.<br><br>
For each of these components, you will see <strong>side-by-side results produced by different extraction methods.</strong><br>
Your task is to <strong>choose the option that best reflects accurate, clinically meaningful CBT practice.</strong> There are no right or wrong answers — we are seeking your clinical judgment.<br><br>
and to provide the issues with the unpreferred method, you will also see the LLM's preferred option and its rationale for that comparison.<br><br>
Your evaluations will help us refine an AI agent that behaves in a way that is safer, more consistent, and more aligned with real CBT interventions.<br>
Thank you for reading through the description details to make an informed judgement.<br><br>
When you’re ready, click <strong>Start</strong> to begin.
`;

export const FOLLOWUP_METHODS: MethodCatalog[] = [
  { id: "A", key: "chatgpt5", name: "ChatGPT-5", file: "methods/ChatGPT.json", aliases: ["ChatGPT-5", "ChatGPT"] },
  { id: "B", key: "deepseek", name: "DeepSeek", file: "methods/DeepSeek.json", aliases: ["DeepSeek"] },
  { id: "C", key: "chapseq", name: "Chap-Seq", file: "methods/Chap_Seq.json", aliases: ["Chap-Seq", "Chap_Seq"] },
  { id: "D", key: "lcfull", name: "LC-Full", file: "methods/LC_Full.json", aliases: ["LC-Full", "LC_Full"] },
  { id: "E", key: "chunkrag", name: "Chunk-RAG", file: "methods/Chunk_RAG.json", aliases: ["Chunk-RAG", "Chunk_RAG"] },
  { id: "F", key: "policies", name: "Policies", file: "methods/Rules.json", aliases: ["Policies", "Rules"] },
  { id: "G", key: "topaperbook", name: "TOPA-Per-Book", file: "methods/TOPA-Per-Book.json", aliases: ["TOPA-Per-Book"] },
  {
    id: "H",
    key: "topalatefusion",
    name: "TOPA (Late Fusion)",
    file: "methods/TOPAOurExtractor_LateFusion.json",
    aliases: ["TOPA (Late Fusion)", "TOPA Late Fusion"],
  },
  {
    id: "I",
    key: "topaearlyfusion",
    name: "TOPA (Early Fusion)",
    file: "methods/TOPAOurExtractor_EarlyFusion.json",
    aliases: ["TOPA (Early Fusion)", "TOPA Early Fusion"],
  },
  { id: "J", key: "mamba", name: "Mamba", file: "methods/Mamba.json", aliases: ["Mamba"] },
  { id: "K", key: "mergerag", name: "Merge-RAG", file: "methods/Merge_RAG.json", aliases: ["Merge-RAG", "Merge_RAG"] },
];

export const AGREEMENT_OPTIONS: { value: AgreementChoice; label: string; help: string }[] = [
  { value: "completely_agree", label: "Completely agree", help: "The LLM winner and rationale match your view." },
  { value: "mostly_agree", label: "Mostly agree", help: "You generally agree, with only minor reservations." },
  { value: "partially_agree", label: "Partially agree / mixed", help: "Some parts make sense, but the judgment is mixed." },
  { value: "mostly_disagree", label: "Mostly disagree", help: "You disagree with most of the LLM's judgment or rationale." },
  { value: "completely_disagree", label: "Completely disagree", help: "The LLM winner and rationale do not match your view." },
];

export const ISSUE_OPTIONS: { value: IssueTag; label: string; help: string }[] = [
  { value: "incomplete", label: "Incomplete", help: "The content is missing important elements of the component." },
  { value: "vague_non_operational", label: "Vague / Non-operational", help: "The content is unclear, too abstract, or not actionable." },
  {
    value: "poorly_structured",
    label: "Poorly structured",
    help: "The content is not well organized, mixes levels of abstraction, contains overlapping or redundant items, or fails to separate categories cleanly.",
  },
  { value: "irrelevant", label: "Irrelevant", help: "The content includes items that are not relevant." },
  {
    value: "low_practical_utility",
    label: "Low practical utility",
    help: "Even if partly correct, the content is not sufficiently useful in practice because it is hard to apply, monitor, or integrate into the downstream system.",
  },
];

function buildMethodLookup() {
  const map = new Map<string, MethodCatalog>();
  for (const method of FOLLOWUP_METHODS) {
    map.set(normalizeMethodName(method.name), method);
    map.set(normalizeMethodName(method.file), method);
    for (const alias of method.aliases) map.set(normalizeMethodName(alias), method);
  }
  return map;
}

const METHOD_LOOKUP = buildMethodLookup();

export function componentRank(component: string) {
  const idx = COMPONENT_ORDER.indexOf(component);
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

export function normalizeMethodName(value: string) {
  return (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function findMethodCatalog(methodName: string) {
  return METHOD_LOOKUP.get(normalizeMethodName(methodName)) ?? null;
}

export function getMethodDisplayLabel(methodName: string, fallback?: string) {
  const catalog = findMethodCatalog(methodName);
  if (catalog?.id) return `Method ${catalog.id}`;
  return fallback || "Unknown";
}

export function nowUtc() {
  return new Date().toISOString();
}

export function prettify(value: string) {
  return (value || "")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}
