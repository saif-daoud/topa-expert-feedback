import { componentRank, type FollowupResponse } from "../followupConfig";

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type PostJsonOptions = {
  keepalive?: boolean;
  timeoutMs?: number;
};

type RetryOptions = PostJsonOptions & {
  maxAttempts?: number;
  onRetry?: (meta: { attempt: number; nextAttempt: number; maxAttempts: number; delayMs: number; error: any }) => void;
};

async function fetchJSON(url: string, payload: unknown, options: PostJsonOptions = {}) {
  const controller = new AbortController();
  const timeoutMs = Math.max(1000, Number(options.timeoutMs ?? 12000));
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: options.keepalive === true,
      signal: controller.signal,
    });
  } catch (error: any) {
    window.clearTimeout(timeoutId);
    if (error?.name === "AbortError") {
      const timeoutError: any = new Error("Request timed out");
      timeoutError.status = 408;
      timeoutError.name = "AbortError";
      throw timeoutError;
    }
    throw error;
  }

  window.clearTimeout(timeoutId);

  const text = await response.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const error: any = new Error(parsed?.error || text || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return parsed;
}

function isRetryableApiError(error: any) {
  const status = Number(error?.status || 0);
  if (error?.name === "AbortError") return true;
  if (!status) return true;
  if (status === 408 || status === 425 || status === 429) return true;
  return status >= 500;
}

export async function postJSON(url: string, payload: unknown, options: PostJsonOptions = {}) {
  return fetchJSON(url, payload, options);
}

export async function postJSONKeepalive(url: string, payload: unknown, options: PostJsonOptions = {}) {
  return fetchJSON(url, payload, { ...options, keepalive: true });
}

export async function postJSONWithRetry(url: string, payload: unknown, options: RetryOptions = {}) {
  const maxAttempts = Math.max(1, Number(options.maxAttempts ?? 3));
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await postJSON(url, payload, options);
    } catch (error: any) {
      lastError = error;
      if (attempt >= maxAttempts || !isRetryableApiError(error)) throw error;

      const delayMs = Math.min(450 * Math.pow(2, attempt - 1), 5000) + Math.floor(Math.random() * 180);
      options.onRetry?.({
        attempt,
        nextAttempt: attempt + 1,
        maxAttempts,
        delayMs,
        error,
      });
      await sleep(delayMs);
    }
  }

  throw lastError || new Error("Request failed");
}

export function responseKey(row: any) {
  return `${row?.participant_id ?? ""}::${row?.comparison_id ?? row?.id ?? ""}`;
}

export function sortResponses<T extends { component?: string; sequence_index?: number }>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const rankDiff = componentRank(String(a?.component ?? "")) - componentRank(String(b?.component ?? ""));
    if (rankDiff !== 0) return rankDiff;

    const aComponent = String(a?.component ?? "");
    const bComponent = String(b?.component ?? "");
    if (aComponent !== bComponent) return aComponent.localeCompare(bComponent);

    return Number(a?.sequence_index ?? 0) - Number(b?.sequence_index ?? 0);
  });
}

export function mergeHistory(localRows: FollowupResponse[], remoteRows: FollowupResponse[]) {
  const merged = new Map<string, FollowupResponse>();

  for (const row of remoteRows || []) {
    merged.set(responseKey(row), { ...row, synced: true, sync_error: null });
  }

  for (const row of localRows || []) {
    const localRow = { ...row, synced: row?.synced === true };
    const key = responseKey(localRow);
    if (!merged.has(key)) merged.set(key, localRow);
  }

  return sortResponses(Array.from(merged.values()));
}

export function makeResponseId(participantId: string, comparisonId: string) {
  const safeComparisonId = String(comparisonId || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_\-]/g, "");
  return `${participantId}__${safeComparisonId}`;
}
