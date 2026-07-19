import type { SkillPathCandidate, SkillPathInfo } from "../api";

/** One strong path line + optional collapsible candidate list. */
export function PathCandidates({
  info,
  label = "Folder",
}: {
  info: SkillPathInfo;
  label?: string;
}) {
  const details: SkillPathCandidate[] =
    info.candidateDetails ??
    info.candidates.map((path) => ({
      path,
      exists: path === info.path ? info.exists : false,
      writable: true,
    }));
  const extras = details.filter((c) => c.path !== info.path && c.path !== info.preferred);
  const showPreferredNote = info.preferred !== info.path;

  return (
    <div className="path-candidates">
      <p className="path-banner">
        {label}
        {info.exists ? "" : " (will be created)"}: <code>{info.path}</code>
      </p>
      {(extras.length > 0 || showPreferredNote) && (
        <details className="path-candidates-details">
          <summary>
            {details.length} scanned location{details.length === 1 ? "" : "s"}
          </summary>
          <ul>
            {details.map((c) => (
              <li key={c.path}>
                <code title={c.path}>{c.path}</code>
                {c.path === info.preferred && <span className="badge clean">preferred</span>}
                {c.path === info.path && c.path !== info.preferred && (
                  <span className="badge info">active</span>
                )}
                {!c.writable && <span className="badge warn">read-only</span>}
                {!c.exists && <span className="badge">missing</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
