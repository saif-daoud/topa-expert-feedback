import type { FollowupComparison } from "../followupConfig";
import { renderMiniMarkdown } from "../viewers";

function LlmSummaryCard({ comparison }: { comparison: FollowupComparison }) {
  const winner = comparison.llm_selected_winner || comparison.llm_consensus_winner || "Unknown";
  const methodA = comparison["Method X"];
  const methodB = comparison["Method Y"];
  const normalizedWinner = String(winner || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const normalizedA = String(methodA || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const normalizedB = String(methodB || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const winnerLabel = normalizedWinner === normalizedA ? "Method A" : normalizedWinner === normalizedB ? "Method B" : "Unknown";

  return (
    <div className="card llmCard">
      <div className="titleSm">LLM comparison summary</div>

      <div className="summaryGrid">
        <div className="summaryItem">
          <div className="label">LLM preferred option</div>
          <div className="summaryValue">{winnerLabel}</div>
        </div>
      </div>

      {!comparison.llm_all_runs_agree && (
        <div className="callout warningCallout">
          <div className="calloutTitle">Runs were not unanimous</div>
          <div className="calloutBody">
            The chosen judgment was supported by {comparison.llm_supporting_runs || 0} out of 3 runs, so this is a lower-confidence LLM signal.
          </div>
        </div>
      )}

      <div className="questionBlock compactBlock">
        <div className="questionPrompt">LLM rationale</div>
        <div className="descBox" dangerouslySetInnerHTML={{ __html: renderMiniMarkdown(comparison.llm_selected_reason || "No rationale provided.") }} />
      </div>
    </div>
  );
}

export default LlmSummaryCard;
