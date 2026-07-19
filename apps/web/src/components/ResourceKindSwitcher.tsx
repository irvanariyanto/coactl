import {
  availableResourceKinds,
  resourceKindLabel,
  type Mode,
  type ResourceKind,
  type SkillTool,
} from "../nav";

interface Props {
  mode: Mode;
  tool: SkillTool;
  active: ResourceKind;
  onSelect: (kind: ResourceKind) => void;
}

/** Compact switcher so users can jump between resource kinds without the Resources hub. */
export function ResourceKindSwitcher({ tool, active, onSelect }: Props) {
  const kinds = availableResourceKinds(tool);
  if (kinds.length <= 1) return null;

  return (
    <div className="kind-switcher" role="tablist" aria-label="Resource kind">
      {kinds.map((kind) => {
        const selected = kind === active;
        return (
          <button
            key={kind}
            type="button"
            role="tab"
            aria-selected={selected}
            className={`kind-switcher-btn${selected ? " active" : ""}`}
            onClick={() => {
              if (!selected) onSelect(kind);
            }}
          >
            {resourceKindLabel(kind)}
          </button>
        );
      })}
    </div>
  );
}
