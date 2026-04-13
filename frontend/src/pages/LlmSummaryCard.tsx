import { FOLLOWUP_METHODS, getMethodDisplayLabel, type FollowupComparison } from "../followupConfig";
import { renderMiniMarkdown } from "../viewers";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceNamedMethodsWithGlobalLabels(reason: string) {
  const replacements = FOLLOWUP_METHODS.flatMap((method) => [method.name, ...method.aliases].map((name) => ({ name, label: `Method ${method.id}` })))
    .sort((left, right) => right.name.length - left.name.length);

  let normalized = String(reason || "");
  for (const replacement of replacements) {
    normalized = normalized.replace(new RegExp(`\\b${escapeRegExp(replacement.name)}\\b`, "g"), replacement.label);
  }
  return normalized;
}

function normalizeReasonPlaceholders(comparison: FollowupComparison) {
  const outputALabel = getMethodDisplayLabel(comparison.llm_selected_output_a || comparison["Method X"], "Output A");
  const outputBLabel = getMethodDisplayLabel(comparison.llm_selected_output_b || comparison["Method Y"], "Output B");

  return replaceNamedMethodsWithGlobalLabels(comparison.llm_selected_reason || "No rationale provided.")
    .replace(/\bOutputs A and B\b/g, `${outputALabel} and ${outputBLabel}`)
    .replace(/\bOutput A and Output B\b/g, `${outputALabel} and ${outputBLabel}`)
    .replace(/\bOutput A\b/g, outputALabel)
    .replace(/\bOutput B\b/g, outputBLabel)
    .replace(/\b((?:present|shown|found|structure)\s+in|in|from|than|versus|vs\.?|compared to)\s+A\b/g, `$1 ${outputALabel}`)
    .replace(/\b((?:present|shown|found|structure)\s+in|in|from|than|versus|vs\.?|compared to)\s+B\b/g, `$1 ${outputBLabel}`);
}

function LlmSummaryCard({ comparison }: { comparison: FollowupComparison }) {
  const winner = comparison.llm_selected_winner || comparison.llm_consensus_winner || "Unknown";
  const winnerLabel = getMethodDisplayLabel(winner, "Unknown");
  const displayedReason = normalizeReasonPlaceholders(comparison);

  return (
    <div className="card llmCard">
      <div className="titleSm">LLM comparison summary</div>

      <div className="summaryGrid">
        <div className="summaryItem">
          <div className="label">LLM preferred option</div>
          <div className="summaryValue">{winnerLabel}</div>
        </div>
      </div>

      <div className="questionBlock compactBlock">
        <div className="questionPrompt">LLM rationale</div>
        <div className="descBox" dangerouslySetInnerHTML={{ __html: renderMiniMarkdown(displayedReason) }} />
      </div>
    </div>
  );
}

export default LlmSummaryCard;
