import { useMemo } from "react";

/** Unified line diff: what would change at the target if the import overwrites it. */
export function ContentsDiff({ current, incoming }: { current: string; incoming: string }) {
  const rows = useMemo(() => diffLines(current.split("\n"), incoming.split("\n")), [current, incoming]);
  const changed = rows.some((r) => r.kind !== "ctx");
  return (
    <div className="diff-block">
      <div className="diff-head">
        <span className="badge danger">− current on disk</span>
        <span className="badge clean">+ incoming</span>
        {!changed && <span className="muted">contents are identical</span>}
      </div>
      <pre className="diff-body">
        {rows.map((r, i) => (
          <span key={i} className={`diff-line ${r.kind}`}>
            {r.kind === "del" ? "− " : r.kind === "add" ? "+ " : "  "}
            {r.text}
            {"\n"}
          </span>
        ))}
      </pre>
    </div>
  );
}

type DiffRow = { kind: "ctx" | "del" | "add"; text: string };

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
