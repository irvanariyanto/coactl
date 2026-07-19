interface Props {
  onRestore: () => void;
  onDiscard: () => void;
}

export function DraftRecoveryBanner({ onRestore, onDiscard }: Props) {
  return (
    <div className="callout warn draft-recovery" role="status">
      <span>Unsaved draft found in this browser (from before refresh).</span>
      <div className="actions">
        <button className="primary" type="button" onClick={onRestore}>
          Restore draft
        </button>
        <button type="button" className="ghost" onClick={onDiscard}>
          Discard
        </button>
      </div>
    </div>
  );
}
