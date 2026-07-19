import type { ReactNode } from "react";

interface Props {
  title: string;
  blurb: string;
  /** Example path where new items will be written. */
  path?: string;
  children?: ReactNode;
}

/** Centered empty list: what belongs here + where it lives on disk + CTAs. */
export function EmptyResourceState({ title, blurb, path, children }: Props) {
  return (
    <div className="empty empty-resource">
      <p className="empty-title">{title}</p>
      <p className="empty-blurb">{blurb}</p>
      {path && (
        <code className="empty-path" title={path}>
          {path}
        </code>
      )}
      {children && <div className="empty-actions">{children}</div>}
    </div>
  );
}
