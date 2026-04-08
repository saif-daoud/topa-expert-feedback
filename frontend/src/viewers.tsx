import { findMethodCatalog, prettify, type Descriptions } from "./followupConfig";

function normKey(value: string) {
  return (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function stripPlural(value: string) {
  return value.endsWith("s") ? value.slice(0, -1) : value;
}

export function bestMatchingKey(obj: any, desired: string): string | null {
  if (!obj || typeof obj !== "object") return null;

  const target = normKey(desired);
  const targetSingular = stripPlural(target);
  let best: { key: string; score: number } | null = null;

  for (const key of Object.keys(obj)) {
    const normalizedKey = normKey(key);
    const normalizedSingular = stripPlural(normalizedKey);

    let score = 0;
    if (normalizedKey === target) score = 100;
    else if (normalizedSingular === targetSingular) score = 95;
    else if (normalizedKey.includes(target) || target.includes(normalizedKey)) score = 70;
    else if (normalizedSingular.includes(targetSingular) || targetSingular.includes(normalizedSingular)) score = 60;

    if (score > 0 && (!best || score > best.score)) best = { key, score };
  }

  return best?.key ?? null;
}

export function getComponentValue(methodData: any, component: string) {
  const key = bestMatchingKey(methodData, component);
  return key ? methodData[key] : null;
}

export function getDescription(descriptions: Descriptions, component: string) {
  if (!descriptions) return "";
  if (descriptions[component]) return descriptions[component];
  const key = bestMatchingKey(descriptions, component);
  return key ? descriptions[key] : "";
}

export function getMethodOutput(methods: Record<string, any>, methodName: string, component: string) {
  const catalog = findMethodCatalog(methodName);
  if (!catalog) return null;
  const methodData = methods[catalog.key];
  if (!methodData) return null;
  return getComponentValue(methodData, component);
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function renderMiniMarkdown(markdown: string) {
  const safe = escapeHtml(markdown || "");
  const withBold = safe.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  return withBold.replace(/\n/g, "<br/>");
}

function isRecord(value: any): value is Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value);
}

function clipText(value: any, max = 500) {
  if (typeof value !== "string") return value;
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function isPrimitive(value: any) {
  return value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

export function isEmptyValue(value: any): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0 || value.every(isEmptyValue);
  if (isRecord(value)) {
    const keys = Object.keys(value);
    return keys.length === 0 || keys.every((key) => isEmptyValue(value[key]));
  }
  return false;
}

function parseListString(value: string): string[] | null {
  if (typeof value !== "string") return null;

  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return null;

  const isBullet = (line: string) => /^(\-|\*|\u2022)\s+/.test(line);
  const isNumbered = (line: string) => /^\d+[\)\.]\s+/.test(line);
  const listishRatio = lines.filter((line) => isBullet(line) || isNumbered(line)).length / lines.length;

  if (listishRatio < 0.6) return null;

  return lines.map((line) => line.replace(/^(\-|\*|\u2022)\s+/, "").replace(/^\d+[\)\.]\s+/, ""));
}

function NestedBullets({ value, depth = 0 }: { value: any; depth?: number }) {
  const MAX_DEPTH = 7;
  const MAX_ITEMS = 120;

  if (depth > MAX_DEPTH) return <span className="note">...</span>;

  if (isPrimitive(value)) {
    const stringValue = value == null ? "" : String(value);
    const parsedList = typeof value === "string" ? parseListString(value) : null;
    if (parsedList) {
      return (
        <ul className="bullets">
          {parsedList.slice(0, MAX_ITEMS).map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      );
    }

    return <span className="textInline" dangerouslySetInnerHTML={{ __html: renderMiniMarkdown(String(clipText(stringValue, 4000))) }} />;
  }

  if (Array.isArray(value)) {
    return (
      <ul className="bullets">
        {value.slice(0, MAX_ITEMS).map((item, index) => (
          <li key={index}>
            <NestedBullets value={item} depth={depth + 1} />
          </li>
        ))}
      </ul>
    );
  }

  if (isRecord(value)) {
    return (
      <ul className="bullets">
        {Object.entries(value)
          .slice(0, MAX_ITEMS)
          .map(([key, nestedValue]) => (
            <li key={key}>
              <span className="bulletKey">{prettify(key)}:</span> <NestedBullets value={nestedValue} depth={depth + 1} />
            </li>
          ))}
      </ul>
    );
  }

  return <pre className="pre">{JSON.stringify(value, null, 2)}</pre>;
}

function ValueView({ value }: { value: any }) {
  if (isPrimitive(value)) {
    const stringValue = value == null ? "" : String(value);
    const parsedList = typeof value === "string" ? parseListString(value) : null;
    if (parsedList) {
      return (
        <ul className="bullets">
          {parsedList.slice(0, 200).map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      );
    }

    return <div className="text" dangerouslySetInnerHTML={{ __html: renderMiniMarkdown(String(clipText(stringValue, 7000))) }} />;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <div className="note">Empty list.</div>;
    if (value.every(isPrimitive)) return <NestedBullets value={value} />;
    if (value.every(isRecord)) return <TableView data={value} />;
    if (value.length <= 12) {
      return (
        <ul className="bullets">
          {value.map((item, index) => (
            <li key={index}>{isRecord(item) ? <KeyValueView data={item} /> : <NestedBullets value={item} />}</li>
          ))}
        </ul>
      );
    }
    return <TableView data={value} />;
  }

  if (isRecord(value)) return <KeyValueView data={value} />;
  return <pre className="pre">{JSON.stringify(value, null, 2)}</pre>;
}

function TableView({ data }: { data: any }) {
  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) return <div className="note">No rows.</div>;
  if (rows.every(isPrimitive)) return <NestedBullets value={rows} />;

  const MAX_ROWS = 220;
  const shownRows = rows.slice(0, MAX_ROWS);
  const columns: string[] = [];

  for (const row of shownRows.slice(0, 80)) {
    if (!isRecord(row)) continue;
    for (const key of Object.keys(row)) if (!columns.includes(key)) columns.push(key);
  }

  const finalColumns = columns.length ? columns : ["value"];

  return (
    <div className="tableWrap">
      {rows.length > MAX_ROWS && (
        <div className="note">
          Showing first <b>{MAX_ROWS}</b> rows out of <b>{rows.length}</b>.
        </div>
      )}

      <table className="table">
        <thead>
          <tr>
            {finalColumns.map((column) => (
              <th key={column}>{prettify(column)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shownRows.map((row: any, rowIndex: number) => (
            <tr key={rowIndex}>
              {finalColumns.map((column) => {
                const value = isRecord(row) ? row[column] : column === "value" ? row : undefined;
                const cell =
                  typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value == null
                    ? String(clipText(value ?? "", 600))
                    : JSON.stringify(value);
                return <td key={column}>{cell}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KeyValueView({ data }: { data: any }) {
  if (!isRecord(data)) return <div className="note">Unexpected format.</div>;

  return (
    <div className="kv">
      {Object.entries(data).map(([key, value]) => (
        <div key={key} className="kvRow">
          <div className="kvKey">{prettify(key)}</div>
          <div className="kvVal">
            <ValueView value={value} />
          </div>
        </div>
      ))}
    </div>
  );
}

function normalizeForTableRow(value: any): Record<string, any> {
  if (!isRecord(value)) return { value: String(clipText(value ?? "", 1200)) };

  const normalized: Record<string, any> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (Array.isArray(nestedValue)) normalized[key] = nestedValue.map((item) => String(item)).join(", ");
    else if (isRecord(nestedValue)) normalized[key] = JSON.stringify(nestedValue);
    else normalized[key] = nestedValue;
  }
  return normalized;
}

function ConversationStateView({ data }: { data: any }) {
  let rows: any[] | null = null;

  if (Array.isArray(data)) rows = data;
  else if (isRecord(data)) {
    const candidates = ["states", "variables", "dimensions", "items", "conversation_states", "conversation_state"];
    for (const candidate of candidates) {
      const key = bestMatchingKey(data, candidate);
      if (key && Array.isArray(data[key])) {
        rows = data[key];
        break;
      }
    }

    if (!rows) {
      const arrayKeys = Object.keys(data).filter((key) => Array.isArray(data[key]));
      if (arrayKeys.length === 1) rows = data[arrayKeys[0]];
    }
  }

  if (!rows) return <ValueView value={data} />;
  return <TableView data={rows.map(normalizeForTableRow)} />;
}

function removeConfidence(value: any): any {
  if (Array.isArray(value)) return value.map(removeConfidence);
  if (isRecord(value)) {
    const clean: Record<string, any> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      if (normKey(key).includes("confidence")) continue;
      clean[key] = removeConfidence(nestedValue);
    }
    return clean;
  }
  return value;
}

function CautionsView({ data }: { data: any }) {
  return <ValueView value={removeConfidence(data)} />;
}

function ActionSpaceView({ data }: { data: any }) {
  const macroActions = Array.isArray(data) ? data : [];
  const shownActions = macroActions.slice(0, 80);

  return (
    <div className="stack">
      {macroActions.length > 80 && (
        <div className="note">
          Showing first <b>80</b> macro actions out of <b>{macroActions.length}</b>.
        </div>
      )}

      {shownActions.map((macro: any, index: number) => {
        const name = macro?.name ?? macro?.macro_action ?? `Macro ${index + 1}`;
        const goal = macro?.goal ?? macro?.objective ?? macro?.intent ?? null;
        const description = macro?.description ?? macro?.definition ?? null;
        const microActions = Array.isArray(macro?.micro_actions)
          ? macro.micro_actions
          : Array.isArray(macro?.microActions)
          ? macro.microActions
          : [];
        const states =
          macro?.states ?? macro?.state ?? macro?.conversation_states ?? macro?.conversation_state ?? macro?.conversationStates ?? null;

        const extras: Record<string, any> = {};
        if (isRecord(macro)) {
          for (const [key, value] of Object.entries(macro)) {
            if (normKey(key).includes("confidence")) continue;
            if (
              [
                "name",
                "macro_action",
                "goal",
                "objective",
                "intent",
                "description",
                "definition",
                "micro_actions",
                "microActions",
                "states",
                "state",
                "conversation_states",
                "conversation_state",
                "conversationStates",
              ].includes(key)
            ) {
              continue;
            }
            if (isEmptyValue(value)) continue;
            extras[key] = value;
          }
        }

        const goalSummary =
          goal == null
            ? ""
            : typeof goal === "string"
            ? goal
            : String(goal?.objective ?? goal?.goal ?? goal?.name ?? JSON.stringify(goal));

        return (
          <details key={index} className="accordion">
            <summary className="accordionSummary">
              <div className="accTitle">{clipText(name, 220)}</div>
              <div className="accMeta">{clipText(goalSummary || String(description || "Click to expand micro actions"), 220)}</div>
            </summary>

            <div className="accordionBody">
              {(goal || description || states || Object.keys(extras).length > 0) && (
                <div className="stack">
                  {goal && (
                    <div>
                      <div className="label">Goal</div>
                      {typeof goal === "string" ? (
                        <div className="text" dangerouslySetInnerHTML={{ __html: renderMiniMarkdown(String(clipText(goal, 8000))) }} />
                      ) : (
                        <NestedBullets value={goal} />
                      )}
                    </div>
                  )}

                  {description && (
                    <div>
                      <div className="label">Description</div>
                      <div className="text" dangerouslySetInnerHTML={{ __html: renderMiniMarkdown(String(clipText(description, 8000))) }} />
                    </div>
                  )}

                  {!isEmptyValue(states) && (
                    <div>
                      <div className="label">States</div>
                      <ValueView value={states} />
                    </div>
                  )}

                  {Object.keys(extras).length > 0 && (
                    <div>
                      <div className="label">Other fields</div>
                      <KeyValueView data={extras} />
                    </div>
                  )}
                </div>
              )}

              <div className="label">Micro actions ({microActions.length})</div>
              {microActions.length === 0 ? (
                <div className="note">No micro actions.</div>
              ) : (
                <ul className="bullets">
                  {microActions.slice(0, 220).map((micro: any, microIndex: number) => {
                    const microName = micro?.name ?? micro?.micro_action ?? `Micro ${microIndex + 1}`;
                    const microDescription = micro?.description ?? micro?.definition;
                    const microExtras: Record<string, any> = {};

                    if (isRecord(micro)) {
                      for (const [key, value] of Object.entries(micro)) {
                        if (normKey(key).includes("confidence")) continue;
                        if (["name", "micro_action", "description", "definition"].includes(key)) continue;
                        if (isEmptyValue(value)) continue;
                        microExtras[key] = value;
                      }
                    }

                    return (
                      <li key={microIndex}>
                        <div className="microName">{clipText(microName, 220)}</div>
                        {microDescription && <div className="microDesc">{clipText(String(microDescription), 1200)}</div>}
                        {Object.keys(microExtras).length > 0 && <KeyValueView data={microExtras} />}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}

export function ComponentViewer({ component, value }: { component: string; value: any }) {
  const normalizedComponent = normKey(component);
  const cleanedValue = removeConfidence(value);

  if (normalizedComponent === "actionspace") return <ActionSpaceView data={cleanedValue} />;
  if (normalizedComponent === "conversationstate" || normalizedComponent === "conversationstates") {
    return <ConversationStateView data={cleanedValue} />;
  }
  if (normalizedComponent.includes("caution")) return <CautionsView data={cleanedValue} />;
  return <ValueView value={cleanedValue} />;
}

export function MethodOutputCard({
  label,
  methodName,
  component,
  value,
}: {
  label: "Method A" | "Method B";
  methodName: string;
  component: string;
  value: any;
}) {
  const mappedMethod = findMethodCatalog(methodName);

  return (
    <div className="card optionCard">
      <div className="optionHeader">
        <div>
          <div className="optionTitle">{label}</div>
        </div>
      </div>

      <div className="optionBody">
        {!mappedMethod ? (
          <div className="note">No method mapping was found for this output.</div>
        ) : isEmptyValue(value) ? (
          <div className="note">No output was found for {label} on {prettify(component)}.</div>
        ) : (
          <ComponentViewer component={component} value={value} />
        )}
      </div>
    </div>
  );
}
