import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  API_BASE,
  BASE_URL,
  FOLLOWUP_ASSIGNMENT_TARGET,
  FOLLOWUP_METHODS,
  ISSUE_OPTIONS,
  STORAGE_KEYS,
  getMethodDisplayLabel,
  normalizeMethodName,
  nowUtc,
  prettify,
  type Descriptions,
  type FollowupComparison,
  type FollowupResponse,
  type IssueTag,
  type WinnerChoice,
} from "../followupConfig";
import { MethodOutputCard, getDescription, getMethodOutput, renderMiniMarkdown } from "../viewers";
import LlmSummaryCard from "./LlmSummaryCard";
import { makeResponseId, mergeHistory, postJSON, postJSONKeepalive, postJSONWithRetry, sleep, sortResponses } from "./surveyUtils";

function friendlySyncError(error: any) {
  const message = String(error?.message || "").trim();
  if (!message || message.toLowerCase() === "failed to fetch") {
    return "Network is slow right now. Your response is saved on this device and will retry automatically.";
  }
  return `Your response is saved on this device and will retry automatically. Details: ${message}`;
}

function SurveyPage() {
  const navigate = useNavigate();
  const [token, setToken] = useState(() => localStorage.getItem(STORAGE_KEYS.token) || "");
  const [participantId, setParticipantId] = useState(() => localStorage.getItem(STORAGE_KEYS.participantId) || "");
  const [descriptions, setDescriptions] = useState<Descriptions>({});
  const [methods, setMethods] = useState<Record<string, any>>({});
  const [comparisons, setComparisons] = useState<FollowupComparison[] | null>(null);
  const [targetCount, setTargetCount] = useState(FOLLOWUP_ASSIGNMENT_TARGET);
  const [winnerChoice, setWinnerChoice] = useState<WinnerChoice | "">("");
  const [issueTags, setIssueTags] = useState<IssueTag[]>([]);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [sessionExpiredMsg, setSessionExpiredMsg] = useState("Your session has expired. Please refresh your access token to continue.");
  const [history, setHistory] = useState<FollowupResponse[]>(() => {
    const raw = localStorage.getItem(STORAGE_KEYS.responses);
    try {
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map((row) => ({ ...row, synced: row?.synced === true })) : [];
    } catch {
      return [];
    }
  });

  const tokenRef = useRef(token);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.responses, JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEYS.profileDone) === "1";
    if (!token || !participantId || !done) navigate("/", { replace: true });
  }, [navigate, participantId, token]);

  async function refreshSessionToken() {
    const currentToken = tokenRef.current;
    if (!currentToken) throw new Error("Missing token");
    const result = await postJSON(`${API_BASE}/refresh`, { token: currentToken });
    localStorage.setItem(STORAGE_KEYS.token, String(result.token));
    setToken(String(result.token));
    return String(result.token);
  }

  async function uploadResponseWithRetry(responseRow: FollowupResponse, maxAttempts = 4) {
    let lastError: any = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        await postJSONKeepalive(`${API_BASE}/response`, { token: tokenRef.current, response: responseRow });
        return;
      } catch (error: any) {
        lastError = error;
        if (error?.status === 401) {
          try {
            await refreshSessionToken();
            await postJSONKeepalive(`${API_BASE}/response`, { token: tokenRef.current, response: responseRow });
            return;
          } catch (refreshError: any) {
            setSessionExpiredMsg(refreshError?.message || "Session expired");
            setSessionExpired(true);
            throw refreshError;
          }
        }
        await sleep(450 * Math.pow(2, attempt) + Math.floor(Math.random() * 180));
      }
    }
    throw lastError || new Error("Failed to upload response");
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const descriptionPayload = await fetch(`${BASE_URL}data/component_descriptions.json`).then((response) => response.json()).catch(() => ({}));

      const loadedMethods = await Promise.all(
        FOLLOWUP_METHODS.map(async (method) => {
          try {
            return [method.key, await fetch(`${BASE_URL}data/${method.file}`).then((response) => response.json())] as const;
          } catch {
            return [method.key, null] as const;
          }
        })
      );

      if (cancelled) return;
      const methodMap: Record<string, any> = {};
      for (const [key, payload] of loadedMethods) methodMap[key] = payload;

      setDescriptions(descriptionPayload || {});
      setMethods(methodMap);
    })().catch((error) => {
      if (!cancelled) setStatus(`Failed to load survey data: ${error.message}`);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!token || !participantId) return;

    (async () => {
      let result: any = null;
      try {
        result = await postJSONWithRetry(
          `${API_BASE}/assigned-comparisons`,
          { token: tokenRef.current },
          {
            maxAttempts: 10,
            timeoutMs: 3000,
            onRetry: ({ nextAttempt, maxAttempts }) => {
              if (!cancelled) {
                setStatus(`Loading your comparisons. Connection is slow, retrying automatically (${nextAttempt}/${maxAttempts})...`);
              }
            },
          }
        );
      } catch (error: any) {
        if (error?.status === 401) {
          try {
            await refreshSessionToken();
            result = await postJSONWithRetry(
              `${API_BASE}/assigned-comparisons`,
              { token: tokenRef.current },
              {
                maxAttempts: 10,
                timeoutMs: 3000,
                onRetry: ({ nextAttempt, maxAttempts }) => {
                  if (!cancelled) {
                    setStatus(`Loading your comparisons. Connection is slow, retrying automatically (${nextAttempt}/${maxAttempts})...`);
                  }
                },
              }
            );
          } catch (refreshError: any) {
            if (!cancelled) {
              setSessionExpiredMsg(refreshError?.message || "Session expired");
              setSessionExpired(true);
            }
            return;
          }
        } else {
          throw error;
        }
      }

      if (cancelled) return;
      const assignedComparisons = Array.isArray(result?.comparisons) ? result.comparisons : [];
      setComparisons(
        [...assignedComparisons].sort(
          (left, right) => Number(left?.sequence_index ?? 0) - Number(right?.sequence_index ?? 0) || String(left?.comparison_id || "").localeCompare(String(right?.comparison_id || ""))
        )
      );
      setTargetCount(Number(result?.target_count || FOLLOWUP_ASSIGNMENT_TARGET));
      setStatus("");
    })().catch((error) => {
      if (!cancelled) setStatus(`Failed to load assigned comparisons: ${error.message}`);
    });

    return () => {
      cancelled = true;
    };
  }, [participantId, token]);

  const participantHistory = useMemo(
    () => sortResponses(history.filter((row) => String(row?.participant_id || "") === String(participantId))),
    [history, participantId]
  );
  const assignedComparisons = useMemo(
    () =>
      [...(comparisons || [])].sort(
        (left, right) => Number(left?.sequence_index ?? 0) - Number(right?.sequence_index ?? 0) || String(left?.comparison_id || "").localeCompare(String(right?.comparison_id || ""))
      ),
    [comparisons]
  );
  const assignedComparisonIds = useMemo(() => new Set(assignedComparisons.map((row) => row.comparison_id)), [assignedComparisons]);
  const answeredComparisonIds = useMemo(
    () => new Set(participantHistory.filter((row) => assignedComparisonIds.has(row.comparison_id)).map((row) => row.comparison_id)),
    [assignedComparisonIds, participantHistory]
  );
  const answeredCount = useMemo(() => assignedComparisons.filter((row) => answeredComparisonIds.has(row.comparison_id)).length, [assignedComparisons, answeredComparisonIds]);
  const syncedAnsweredCount = useMemo(
    () => participantHistory.filter((row) => assignedComparisonIds.has(row.comparison_id) && row?.synced === true).length,
    [assignedComparisonIds, participantHistory]
  );
  const currentComparison = useMemo(
    () => assignedComparisons.find((row) => !answeredComparisonIds.has(row.comparison_id)) ?? null,
    [assignedComparisons, answeredComparisonIds]
  );
  const totalAssigned = assignedComparisons.length;
  const currentPosition = currentComparison ? Math.min(answeredCount + 1, totalAssigned || targetCount) : answeredCount;
  const currentComponent = currentComparison?.component || assignedComparisons[0]?.component || "";
  const methodXValue = currentComparison ? getMethodOutput(methods, currentComparison["Method X"], currentComparison.component) : null;
  const methodYValue = currentComparison ? getMethodOutput(methods, currentComparison["Method Y"], currentComparison.component) : null;
  const methodXLabel = currentComparison ? getMethodDisplayLabel(currentComparison["Method X"], "Method X") : "Method X";
  const methodYLabel = currentComparison ? getMethodDisplayLabel(currentComparison["Method Y"], "Method Y") : "Method Y";
  const pendingTotal = participantHistory.filter((row) => row?.synced !== true).length;

  useEffect(() => {
    setWinnerChoice("");
    setIssueTags([]);
    setFeedback("");
  }, [currentComparison?.comparison_id]);

  useEffect(() => {
    if (!token || !participantId) return;
    void syncPendingResponses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, participantId]);

  useEffect(() => {
    const onOnline = () => void syncPendingResponses();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantId]);

  useEffect(() => {
    if (pendingTotal <= 0) return;
    const intervalId = window.setInterval(() => {
      void syncPendingResponses();
    }, 20000);
    return () => window.clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTotal, participantId]);

  if (!token || !participantId) return null;

  async function syncPendingResponses() {
    if (!tokenRef.current || !participantId || syncing) return;
    setSyncing(true);
    try {
      let remoteRows: FollowupResponse[] = [];
      try {
        const result = await postJSON(`${API_BASE}/history`, { token: tokenRef.current });
        remoteRows = Array.isArray(result?.responses) ? result.responses : [];
      } catch (error: any) {
        if (error?.status === 401) {
          try {
            await refreshSessionToken();
            const retryResult = await postJSON(`${API_BASE}/history`, { token: tokenRef.current });
            remoteRows = Array.isArray(retryResult?.responses) ? retryResult.responses : [];
          } catch (refreshError: any) {
            setSessionExpiredMsg(refreshError?.message || "Session expired");
            setSessionExpired(true);
            return;
          }
        } else {
          throw error;
        }
      }

      const merged = mergeHistory(participantHistory, remoteRows);
      setHistory((previous) => mergeHistory(previous, remoteRows));
      const remoteIds = new Set<string>(remoteRows.map((row: any) => String(row?.id || "")).filter(Boolean));
      const pendingRows = sortResponses(merged.filter((row) => row?.id && row?.synced !== true && !remoteIds.has(String(row.id))));

      if (pendingRows.length > 0) {
        let syncResult: any = null;
        try {
          syncResult = await postJSON(`${API_BASE}/sync`, {
            token: tokenRef.current,
            responses: pendingRows,
          });
        } catch (error: any) {
          if (error?.status === 401) {
            try {
              await refreshSessionToken();
              syncResult = await postJSON(`${API_BASE}/sync`, {
                token: tokenRef.current,
                responses: pendingRows,
              });
            } catch (refreshError: any) {
              setSessionExpiredMsg(refreshError?.message || "Session expired");
              setSessionExpired(true);
              return;
            }
          } else {
            throw error;
          }
        }

        const savedIds = new Set<string>((Array.isArray(syncResult?.saved_ids) ? syncResult.saved_ids : []).map((id: any) => String(id)));
        const failedMap = new Map<string, string>(
          (Array.isArray(syncResult?.failed) ? syncResult.failed : []).map((entry: any) => [String(entry?.id || ""), String(entry?.error || "Upload failed")])
        );

        setHistory((previous) =>
          previous.map((item) => {
            const itemId = String(item?.id || "");
            if (savedIds.has(itemId)) {
              return { ...item, synced: true, sync_error: null, synced_at_utc: nowUtc() };
            }
            if (failedMap.has(itemId)) {
              return { ...item, synced: false, sync_error: failedMap.get(itemId) || "Upload failed" };
            }
            return item;
          })
        );

        if (failedMap.size === 0) {
          setStatus("");
        } else {
          setStatus("Some responses are still pending, but your work is safe on this device.");
        }
      }
    } catch (error: any) {
      setStatus(friendlySyncError(error));
    } finally {
      setSyncing(false);
    }
  }

  async function submitResponse() {
    if (!currentComparison || !winnerChoice || issueTags.length === 0 || !participantId) return;

    const selectedMethodName = winnerChoice === "method_x" ? currentComparison["Method X"] : winnerChoice === "method_y" ? currentComparison["Method Y"] : null;
    const llmWinner = currentComparison.llm_selected_winner || currentComparison.llm_consensus_winner || "";
    const expertMatchesLlm = selectedMethodName == null ? null : normalizeMethodName(selectedMethodName) === normalizeMethodName(llmWinner) ? 1 : 0;

    const responseRow: FollowupResponse = {
      id: makeResponseId(participantId, currentComparison.comparison_id),
      participant_id: participantId,
      comparison_id: currentComparison.comparison_id,
      component: currentComparison.component,
      sequence_index: currentComparison.sequence_index,
      method_x_name: currentComparison["Method X"],
      method_y_name: currentComparison["Method Y"],
      llm_consensus_winner: currentComparison.llm_consensus_winner || null,
      llm_consensus_detail: currentComparison.llm_consensus_detail || null,
      llm_all_runs_agree: currentComparison.llm_all_runs_agree ? 1 : 0,
      llm_supporting_runs: currentComparison.llm_supporting_runs || null,
      llm_selected_run: currentComparison.llm_selected_run || null,
      llm_selected_winner: currentComparison.llm_selected_winner || null,
      llm_selected_reason: currentComparison.llm_selected_reason || null,
      llm_selected_output_a_name: currentComparison.llm_selected_output_a || null,
      llm_selected_output_b_name: currentComparison.llm_selected_output_b || null,
      llm_selected_swap_order_in_prompt: currentComparison.llm_selected_swap_order_in_prompt ? 1 : 0,
      winner_choice: winnerChoice,
      expert_selected_method_name: selectedMethodName,
      expert_matches_llm_selected: expertMatchesLlm,
      issue_tags: issueTags,
      feedback: feedback.trim() || null,
      source_expert_n: currentComparison.expert_n,
      effective_expert_n: currentComparison.effective_expert_n ?? null,
      timestamp_utc: nowUtc(),
      user_agent: navigator.userAgent,
      page_url: window.location.href,
      synced: false,
      sync_error: null,
    };

    setHistory((previous) => sortResponses([...previous, responseRow]));
    setSubmitting(true);
    window.setTimeout(() => setSubmitting(false), 0);

    void uploadResponseWithRetry(responseRow)
      .then(() => {
        setHistory((previous) => previous.map((row) => (row.id === responseRow.id ? { ...row, synced: true, sync_error: null, synced_at_utc: nowUtc() } : row)));
        setStatus("");
      })
      .catch((error: any) => {
        setHistory((previous) => previous.map((row) => (row.id === responseRow.id ? { ...row, synced: false, sync_error: error?.message || "Upload failed" } : row)));
        setStatus(friendlySyncError(error));
      });
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEYS.token);
    localStorage.removeItem(STORAGE_KEYS.participantId);
    localStorage.removeItem(STORAGE_KEYS.profileDone);
    localStorage.removeItem(STORAGE_KEYS.responses);
    setHistory([]);
    setToken("");
    setParticipantId("");
    navigate("/", { replace: true });
  }

  if (!comparisons || Object.keys(methods).length === 0) {
    return (
      <div className="app">
        <div className="container narrow">
          <div className="card">
            <div className="title">Loading...</div>
            <div className="note">Fetching your assigned comparisons and method outputs.</div>
            {status && <div className="status">{status}</div>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="container">
        {sessionExpired && (
          <div className="modalOverlay" role="dialog" aria-modal="true">
            <div className="modalCard">
              <div className="titleSm">Session expired</div>
              <div className="note modalCopy">{sessionExpiredMsg}</div>
              <div className="formActions">
                <button
                  className="btn btnPrimary"
                  onClick={() => {
                    void refreshSessionToken()
                      .then(() => {
                        setSessionExpired(false);
                        return syncPendingResponses();
                      })
                      .catch((error: any) => setStatus(`Error: ${error?.message || "Failed to refresh"}`));
                  }}
                >
                  Refresh session
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    localStorage.removeItem(STORAGE_KEYS.token);
                    localStorage.removeItem(STORAGE_KEYS.profileDone);
                    setToken("");
                    setSessionExpired(false);
                    navigate("/", { replace: true });
                  }}
                >
                  Re-enter access code
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="topbar">
          <div>
            <div className="title">TOPA Expert Survey</div>
          </div>
          <div className="topbarRight">
            <div className={`syncBadge ${pendingTotal === 0 ? "ok" : "warn"}`}>{syncing ? `Syncing... (${pendingTotal})` : pendingTotal === 0 ? "Synced" : `Pending uploads: ${pendingTotal}`}</div>
            {pendingTotal > 0 && <button className="btn" onClick={() => void syncPendingResponses()} disabled={syncing}>Sync now</button>}
            <button className="btn" onClick={logout}>Logout</button>
          </div>
        </div>

        {status && <div className="status">{status}</div>}

        {pendingTotal > 0 && (
          <div className="callout">
            <div className="calloutTitle">Background syncing</div>
            <div className="calloutBody">
              Your responses are saved on this device and will keep retrying in the background until they reach the server.
            </div>
          </div>
        )}

        <div className="toolbar">
          <div className="toolbarBlock">
            <div className="label">Progress</div>
            <div className="pill">{answeredCount}/{Math.max(totalAssigned, targetCount)} completed</div>
            <div className="progressBar" aria-hidden="true">
              <div className="progressFill" style={{ width: `${totalAssigned > 0 ? (answeredCount / totalAssigned) * 100 : 0}%` }} />
            </div>
            <div className="note progressNote">Synced: {syncedAnsweredCount}/{Math.max(totalAssigned, targetCount)}</div>
          </div>

          <div className="toolbarBlock">
            <div className="label">Current item</div>
            <div className="pill">
              {currentComparison ? `Comparison ${currentPosition} of ${totalAssigned || targetCount}` : `Completed ${answeredCount} of ${totalAssigned || targetCount}`}
            </div>
            {currentComparison ? (
              <div className="componentHighlight">
                <div className="componentHighlightLabel">Component</div>
                <div className="componentHighlightValue">{prettify(currentComponent)}</div>
              </div>
            ) : (
              <div className="note progressNote">All assigned comparisons are answered.</div>
            )}
          </div>

          <div className="toolbarBlock grow">
            <div className="label">Description</div>
            <div className="descBox" dangerouslySetInnerHTML={{ __html: renderMiniMarkdown(getDescription(descriptions, currentComponent) || "No description found for this component.") }} />
          </div>
        </div>

        {totalAssigned === 0 ? (
          <div className="card">
            <div className="titleSm">No comparisons available</div>
            <div className="note">No low-coverage comparisons are currently available for assignment.</div>
          </div>
        ) : currentComparison ? (
          <>
            <LlmSummaryCard comparison={currentComparison} />

            <div className="grid2">
              <MethodOutputCard label={methodXLabel} methodName={currentComparison["Method X"]} component={currentComparison.component} value={methodXValue} />
              <MethodOutputCard label={methodYLabel} methodName={currentComparison["Method Y"]} component={currentComparison.component} value={methodYValue} />
            </div>

            <div className="card voteCard">
              <div className="titleSm">Your response</div>
              <div className="note">{`Comparison ${currentPosition} of ${totalAssigned || targetCount}`}</div>

              <div className="questionBlock">
                <div className="questionPrompt">1. Which option do you prefer?</div>
                <div className="choiceList">
                  {[
                    { value: "method_x" as WinnerChoice, label: methodXLabel, help: `You prefer ${methodXLabel}.` },
                    { value: "method_y" as WinnerChoice, label: methodYLabel, help: `You prefer ${methodYLabel}.` },
                    { value: "tie" as WinnerChoice, label: "Tie", help: "Both options are equally good." },
                  ].map((option) => (
                    <label key={option.value} className={`choiceOption ${winnerChoice === option.value ? "active" : ""}`}>
                      <input type="radio" name="winner_choice" checked={winnerChoice === option.value} onChange={() => setWinnerChoice(option.value)} />
                      <div className="choiceBody">
                        <div className="choiceTitle">{option.label}</div>
                        <div className="choiceHelp">{option.help}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="questionBlock">
                <div className="questionPrompt">2. Which issues in the unpreferred option best explain your preference? Select all that apply.</div>
                <div className="choiceList">
                  {ISSUE_OPTIONS.map((option) => {
                    const active = issueTags.includes(option.value);
                    return (
                      <label key={option.value} className={`choiceOption ${active ? "active" : ""}`}>
                        <input
                          type="checkbox"
                          name="issue_tags"
                          checked={active}
                          onChange={() =>
                            setIssueTags((current) => (current.includes(option.value) ? current.filter((value) => value !== option.value) : [...current, option.value]))
                          }
                        />
                        <div className="choiceBody">
                          <div className="choiceTitle">{option.label}</div>
                          <div className="choiceHelp">{option.help}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="questionBlock">
                <div className="questionPrompt">3. Optional feedback</div>
                <textarea className="textarea" placeholder="Explain your reasoning, what the output content have missed." value={feedback} onChange={(event) => setFeedback(event.target.value)} rows={4} />
              </div>

              <div className="voteBar">
                <button className="btn btnPrimary" onClick={() => void submitResponse()} disabled={!winnerChoice || issueTags.length === 0 || submitting}>
                  {submitting ? "Saving..." : "Save response"}
                </button>
                <button className="btn btnGhost" onClick={() => void syncPendingResponses()} disabled={syncing}>Sync saved responses</button>
              </div>
            </div>
          </>
        ) : (
          <div className="card">
            <div className="titleSm">Assignment complete</div>
            <div className="note">You have answered all {totalAssigned || targetCount} assigned follow-up comparisons.</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SurveyPage;
