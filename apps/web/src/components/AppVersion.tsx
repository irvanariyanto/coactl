import { useEffect, useRef, useState } from "react";
import { findAvailableUpdate, UPDATE_COMMAND } from "../update-check";

export function AppVersion() {
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void findAvailableUpdate(__APP_VERSION__).then((version) => {
      if (!cancelled) setAvailableVersion(version);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  if (!availableVersion) {
    return <span className="app-version" aria-label={`coactl version ${__APP_VERSION__}`}>v{__APP_VERSION__}</span>;
  }

  return (
    <div className="app-version-wrap" ref={containerRef}>
      <button
        type="button"
        className="app-version available"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
          setCopyState("idle");
        }}
      >
        v{availableVersion} available
      </button>
      {open && (
        <section className="app-update-popover" aria-label={`coactl ${availableVersion} is available`}>
          <span className="app-update-kicker">Update available</span>
          <strong>coactl v{availableVersion}</strong>
          <p>Copy this command and run it in a terminal.</p>
          <code>{UPDATE_COMMAND}</code>
          <button
            type="button"
            className="app-update-copy"
            onClick={() => {
              if (!navigator.clipboard?.writeText) {
                setCopyState("failed");
                return;
              }
              void navigator.clipboard.writeText(UPDATE_COMMAND).then(
                () => setCopyState("copied"),
                () => setCopyState("failed"),
              );
            }}
          >
            {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy update command"}
          </button>
        </section>
      )}
    </div>
  );
}
