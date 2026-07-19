import { useRef, useState } from "react";
import {
  api,
  type ProfileExportDocument,
  type ProfileImportPreview,
  type ProfileState,
} from "../api";

interface Props {
  profile: ProfileState | null;
  onImported: (profile: ProfileState) => void;
  onToast: (kind: "success" | "error", text: string) => void;
}

export function ProfileDataPanel({ profile, onImported, onToast }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [document, setDocument] = useState<ProfileExportDocument | null>(null);
  const [preview, setPreview] = useState<ProfileImportPreview | null>(null);
  const [busy, setBusy] = useState(false);

  async function exportData() {
    setBusy(true);
    try {
      const data = await api.exportProfile();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = `coactl-profile-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      onToast("success", "Profile exported");
    } catch (err) {
      onToast("error", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function chooseImport(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setPreview(null);
    try {
      const parsed = JSON.parse(await file.text()) as ProfileExportDocument;
      const plan = await api.previewProfileImport(parsed);
      setDocument(parsed);
      setPreview(plan);
    } catch (err) {
      setDocument(null);
      onToast("error", (err as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function applyImport() {
    if (!document || !preview) return;
    setBusy(true);
    try {
      const next = await api.importProfile(document);
      onImported(next);
      setDocument(null);
      setPreview(null);
      onToast("success", `Imported ${preview.projects.length} project entries`);
    } catch (err) {
      onToast("error", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-settings">
      <div className="auth-settings-head">
        <h2>Portable profile</h2>
        <span className="badge clean">SQLite</span>
      </div>
      <p className="panel-sub">
        Project history and app settings persist in <code>{profile?.databasePath ?? "~/.coactl/coactl.db"}</code>.
        Exported profiles exclude login credentials and do not replace native tool files.
      </p>
      <div className="actions">
        <button type="button" disabled={busy || !profile} onClick={() => void exportData()}>
          Export profile…
        </button>
        <button type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
          Import profile…
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => void chooseImport(event.target.files?.[0])}
        />
      </div>

      {preview && (
        <div className="table-wrap" style={{ marginTop: "0.9rem" }}>
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {preview.projects.map((project) => (
                <tr key={project.path}>
                  <td><code className="path-line">{project.path}</code></td>
                  <td>
                    <span className={`badge ${project.action === "add" ? "clean" : project.action === "remove" ? "danger" : "warn"}`}>
                      {project.action}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="import-bar">
            <span className="muted">
              Active project: <code>{preview.activeProject ?? "none"}</code>
            </span>
            <button className="primary" type="button" disabled={busy} onClick={() => void applyImport()}>
              Apply import
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
