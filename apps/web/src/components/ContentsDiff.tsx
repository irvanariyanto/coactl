import { useMemo, useState } from "react";

type DiffMode = "unified" | "split";

const MODE_KEY = "coactl.diffView";

function loadMode(): DiffMode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === "split" ? "split" : "unified";
  } catch {
    return "unified";
  }
}

/** Line diff for import overwrite preview: unified by default, optional side-by-side. */
export function ContentsDiff({ current, incoming }: { current: string; incoming: string }) {
  const [mode, setMode] = useState<DiffMode>(loadMode);
  const rows = useMemo(() => diffLines(current.split("\n"), incoming.split("\n")), [current, incoming]);
  const sideRows = useMemo(() => toSideRows(rows), [rows]);
  const changed = rows.some((r) => r.kind !== "ctx");

  function selectMode(next: DiffMode) {
    setMode(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      /* ignore quota / private mode */
    }
  }

  return (
    <div className="diff-block">
      <div className="diff-head">
        <span className="badge danger">− current on disk</span>
        <span className="badge clean">+ incoming</span>
        {!changed && <span className="muted">contents are identical</span>}
        <div className="diff-mode" role="group" aria-label="Diff view">
          <button
            type="button"
            className={`diff-mode-btn${mode === "unified" ? " active" : ""}`}
            aria-pressed={mode === "unified"}
            onClick={() => selectMode("unified")}
          >
            Unified
          </button>
          <button
            type="button"
            className={`diff-mode-btn${mode === "split" ? " active" : ""}`}
            aria-pressed={mode === "split"}
            onClick={() => selectMode("split")}
          >
            Side by side
          </button>
        </div>
      </div>
      {mode === "unified" ? (
        <pre className="diff-body">
          {rows.map((r, i) => (
            <span key={i} className={`diff-line ${r.kind}`}>
              {r.kind === "del" ? "− " : r.kind === "add" ? "+ " : "  "}
              {r.text}
              {"\n"}
            </span>
          ))}
        </pre>
      ) : (
        <div className="diff-split" role="table" aria-label="Side-by-side diff">
          <div className="diff-split-head" role="row">
            <div role="columnheader">Current</div>
            <div role="columnheader">Incoming</div>
          </div>
          <div className="diff-split-body">
            {sideRows.map((r, i) => (
              <div key={i} className="diff-split-row" role="row">
                <pre
                  className={`diff-split-cell${r.left ? ` ${r.left.kind}` : " empty"}`}
                  role="cell"
                >
                  {r.left?.text ?? ""}
                </pre>
                <pre
                  className={`diff-split-cell${r.right ? ` ${r.right.kind}` : " empty"}`}
                  role="cell"
                >
                  {r.right?.text ?? ""}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type DiffRow = { kind: "ctx" | "del" | "add"; text: string };

type SideRow = {
  left: { kind: "ctx" | "del"; text: string } | null;
  right: { kind: "ctx" | "add"; text: string } | null;
};

/** Pair delete+add onto one row so side-by-side reads as a replacement. */
function toSideRows(rows: DiffRow[]): SideRow[] {
  const out: SideRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (r.kind === "ctx") {
      out.push({ left: { kind: "ctx", text: r.text }, right: { kind: "ctx", text: r.text } });
      continue;
    }
    if (r.kind === "del" && rows[i + 1]?.kind === "add") {
      out.push({
        left: { kind: "del", text: r.text },
        right: { kind: "add", text: rows[i + 1]!.text },
      });
      i++;
      continue;
    }
    if (r.kind === "del") {
      out.push({ left: { kind: "del", text: r.text }, right: null });
    } else {
      out.push({ left: null, right: { kind: "add", text: r.text } });
    }
  }
  return out;
}

/** LCS-based line diff; SKILL.md files are small so O(n·m) is fine. */
function diffLines(a: string[], b: string[]): DiffRow[] {
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ kind: "ctx", text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      rows.push({ kind: "del", text: a[i]! });
      i++;
    } else {
      rows.push({ kind: "add", text: b[j]! });
      j++;
    }
  }
  while (i < n) rows.push({ kind: "del", text: a[i++]! });
  while (j < m) rows.push({ kind: "add", text: b[j++]! });
  return rows;
}
