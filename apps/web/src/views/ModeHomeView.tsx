import type { AuthStatus, ProfileState } from "../api";
import type { Mode } from "../nav";
import { AuthSettingsPanel } from "./AuthSettingsPanel";
import { ProfileDataPanel } from "./ProfileDataPanel";

interface Props {
  onSelect: (mode: Mode) => void;
  auth: AuthStatus;
  onAuthChange: (status: AuthStatus) => void;
  onToast: (kind: "success" | "error", text: string) => void;
  profile: ProfileState | null;
  onProfileImported: (profile: ProfileState) => void;
}

export function ModeHomeView({ onSelect, auth, onAuthChange, onToast, profile, onProfileImported }: Props) {
  return (
    <>
      <div className="hero">
        <h1>
          Your AI skills, <em>one place</em>
        </h1>
        <p>
          Browse, edit, and copy native <code>SKILL.md</code> files across Claude Code, Cursor,
          Codex, and friends — right where each tool reads them.
        </p>
      </div>
      <div className="mode-grid">
        <button type="button" className="mode-card global" onClick={() => onSelect("global")}>
          <span className="icon" aria-hidden="true">
            <GlobeIcon />
          </span>
          <h2>Global</h2>
          <p>
            User-level skills for every tool installed on this machine —{" "}
            <code>~/.claude/skills</code>, <code>~/.cursor/skills</code>, and more.
          </p>
          <span className="go">Browse installed tools →</span>
        </button>
        <button type="button" className="mode-card project" onClick={() => onSelect("project")}>
          <span className="icon" aria-hidden="true">
            <FolderIcon />
          </span>
          <h2>Project</h2>
          <p>
            Pick a repository, detect the tools configured inside it, and manage its
            project-scoped skills.
          </p>
          <span className="go">Choose a project →</span>
        </button>
      </div>
      <AuthSettingsPanel auth={auth} onAuthChange={onAuthChange} onToast={onToast} />
      <ProfileDataPanel profile={profile} onImported={onProfileImported} onToast={onToast} />
    </>
  );
}

function GlobeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </svg>
  );
}
