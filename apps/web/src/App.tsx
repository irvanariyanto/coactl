import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Skill, type Workspace } from "./api";
import { modeToScope, toolLabel, type Mode, type View } from "./nav";
import { ModeHomeView } from "./views/ModeHomeView";
import { ProjectGateView } from "./views/ProjectGateView";
import { ResourcesView } from "./views/ResourcesView";
import { SkillDetailView } from "./views/SkillDetailView";
import { SkillsListView } from "./views/SkillsListView";
import { ToolsView } from "./views/ToolsView";

interface Toast {
  id: number;
  kind: "success" | "error";
  text: string;
}

export function App() {
  const [view, setView] = useState<View>({ screen: "mode" });
  const [root, setRoot] = useState(() => localStorage.getItem("coactl.root") || "");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [draft, setDraft] = useState<Skill | null>(null);
  const [showAllInstalled, setShowAllInstalled] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busy, setBusy] = useState(false);
  const toastId = useRef(0);

  const effectiveRoot = root.trim() || ".";
  const projectRootSet = Boolean(root.trim());

  const currentMode: Mode | null =
    view.screen === "mode" || view.screen === "project-gate" ? null : view.mode;

  const pushToast = useCallback((kind: Toast["kind"], text: string) => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev.slice(-3), { id, kind, text }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, kind === "error" ? 8000 : 4000);
  }, []);

  const dismissToast = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  const refreshWorkspace = useCallback(
    async (mode: Mode) => {
      setBusy(true);
      try {
        setWorkspace(await api.workspace(effectiveRoot, mode));
      } catch (err) {
        pushToast("error", (err as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [effectiveRoot, pushToast],
  );

  useEffect(() => {
    localStorage.setItem("coactl.root", root.trim());
  }, [root]);

  useEffect(() => {
    if (!currentMode) return;
    void refreshWorkspace(currentMode);
  }, [currentMode, refreshWorkspace]);

  useEffect(() => {
    if (view.screen !== "skills" && view.screen !== "skill") return;
    const scope = modeToScope(view.mode);
    let cancelled = false;
    setBusy(true);
    void api
      .listSkills(effectiveRoot, view.tool, scope)
      .then((res) => {
        if (!cancelled) setSkills(res.skills);
      })
      .catch((err) => {
        if (!cancelled) pushToast("error", (err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, effectiveRoot, pushToast]);

  useEffect(() => {
    if (view.screen !== "skill") {
      setDraft(null);
      return;
    }
    const scope = modeToScope(view.mode);
    let cancelled = false;
    setBusy(true);
    void api
      .getSkill(effectiveRoot, view.tool, view.id, scope, view.path)
      .then((res) => {
        if (!cancelled) setDraft(res.skill);
      })
      .catch((err) => {
        if (!cancelled) pushToast("error", (err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, effectiveRoot, pushToast]);

  function goMode(mode: Mode) {
    if (mode === "project" && !root.trim()) {
      setView({ screen: "project-gate" });
      return;
    }
    setView({ screen: "tools", mode });
  }

  async function handlePickFolder() {
    try {
      const { path } = await api.pickFolder();
      setRoot(path);
    } catch (err) {
      pushToast("error", (err as Error).message);
    }
  }

  async function handleCreate(id: string) {
    if (view.screen !== "skills") return;
    setBusy(true);
    try {
      const { skill } = await api.scaffold(effectiveRoot, {
        id,
        tool: view.tool,
        scope: modeToScope(view.mode),
        save: true,
      });
      pushToast("success", `Created ${skill.id}`);
      setView({
        screen: "skill",
        mode: view.mode,
        tool: view.tool,
        id: skill.id,
        path: skill.filePath,
      });
    } catch (err) {
      pushToast("error", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    if (!draft || view.screen !== "skill") return;
    setBusy(true);
    try {
      const { skill } = await api.saveSkill(
        effectiveRoot,
        {
          tool: draft.tool,
          scope: draft.scope,
          id: draft.id,
          contents: draft.contents,
          filePath: draft.filePath,
        },
        false,
      );
      setDraft(skill);
      pushToast("success", "Saved");
    } catch (err) {
      pushToast("error", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!draft || view.screen !== "skill") return;
    if (!confirm(`Delete ${draft.tool}/${draft.id}?`)) return;
    setBusy(true);
    try {
      await api.deleteSkill(effectiveRoot, draft.tool, draft.id, draft.scope, draft.filePath);
      pushToast("success", `Deleted ${draft.id}`);
      setView({ screen: "skills", mode: view.mode, tool: view.tool });
    } catch (err) {
      pushToast("error", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const crumbs: Array<{ label: string; onClick?: () => void }> = [];
  if (view.screen !== "mode") {
    crumbs.push({ label: "Home", onClick: () => setView({ screen: "mode" }) });
  }
  if (view.screen === "project-gate") {
    crumbs.push({ label: "Project" });
  }
  if (view.screen === "tools" || view.screen === "resources" || view.screen === "skills" || view.screen === "skill") {
    const modeLabel =
      view.mode === "project" && root.trim()
        ? `Project · ${basename(root.trim())}`
        : view.mode === "project"
          ? "Project"
          : "Global";
    crumbs.push({
      label: modeLabel,
      onClick: () => setView({ screen: "tools", mode: view.mode }),
    });
  }
  if (view.screen === "resources" || view.screen === "skills" || view.screen === "skill") {
    crumbs.push({
      label: toolLabel(view.tool),
      onClick: () => setView({ screen: "resources", mode: view.mode, tool: view.tool }),
    });
  }
  if (view.screen === "skills" || view.screen === "skill") {
    crumbs.push({
      label: "Skills",
      onClick: () => setView({ screen: "skills", mode: view.mode, tool: view.tool }),
    });
  }
  if (view.screen === "skill") {
    crumbs.push({ label: view.id });
  }

  const showRootControl =
    view.screen === "project-gate" || currentMode === "project" || view.screen === "skill";

  return (
    <div className="app">
      <header className="topbar">
        <button type="button" className="brand" onClick={() => setView({ screen: "mode" })}>
          <span className="logo">c</span>
          <span>
            coa<em>ctl</em>
          </span>
        </button>

        {currentMode && (
          <span className={`mode-pill ${currentMode}`}>
            <span className="dot" />
            {currentMode === "global" ? "Global" : "Project"}
          </span>
        )}

        <div className="topbar-spacer" />

        {busy && <span className="busy-dot" aria-label="Working" />}

        {showRootControl && (
          <div className="root-control">
            <input
              id="root"
              aria-label="Project root"
              value={root}
              onChange={(e) => setRoot(e.target.value)}
              placeholder="/path/to/project"
            />
            <button type="button" onClick={() => void handlePickFolder()}>
              Browse…
            </button>
          </div>
        )}

        {currentMode && (
          <button
            type="button"
            className="ghost"
            onClick={() => void refreshWorkspace(currentMode)}
            disabled={busy}
          >
            Refresh
          </button>
        )}
      </header>

      <main className="content">
        {crumbs.length > 0 && (
          <nav className="breadcrumb" aria-label="Breadcrumb">
            {crumbs.map((c, i) => (
              <span key={`${c.label}-${i}`}>
                {i > 0 && <span className="sep">/</span>}
                {c.onClick ? (
                  <button type="button" className="crumb-link" onClick={c.onClick}>
                    {c.label}
                  </button>
                ) : (
                  <span className="crumb-current">{c.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}

        {view.screen === "mode" && <ModeHomeView onSelect={goMode} />}

        {view.screen === "project-gate" && (
          <ProjectGateView
            root={root}
            onRootChange={setRoot}
            onPickFolder={() => void handlePickFolder()}
            onContinue={() => {
              if (!root.trim()) return;
              setView({ screen: "tools", mode: "project" });
            }}
          />
        )}

        {view.screen === "tools" && workspace && (
          <ToolsView
            mode={view.mode}
            workspace={workspace}
            showAllInstalled={showAllInstalled}
            onShowAllInstalled={setShowAllInstalled}
            onSelectTool={(tool) => setView({ screen: "resources", mode: view.mode, tool })}
          />
        )}

        {view.screen === "resources" && workspace && (
          <ResourcesView
            mode={view.mode}
            tool={view.tool}
            workspace={workspace}
            onSelectSkills={() => setView({ screen: "skills", mode: view.mode, tool: view.tool })}
          />
        )}

        {view.screen === "skills" && workspace && (
          <SkillsListView
            mode={view.mode}
            tool={view.tool}
            skills={skills}
            workspace={workspace}
            busy={busy}
            onOpen={(skill) =>
              setView({
                screen: "skill",
                mode: view.mode,
                tool: view.tool,
                id: skill.id,
                path: skill.filePath,
              })
            }
            onCreate={handleCreate}
          />
        )}

        {view.screen === "skill" && draft && workspace && (
          <SkillDetailView
            mode={view.mode}
            tool={view.tool}
            skill={draft}
            workspace={workspace}
            projectRootSet={projectRootSet}
            busy={busy}
            onChangeContents={(contents) => setDraft({ ...draft, contents })}
            onSave={handleSave}
            onDelete={handleDelete}
            onPreviewImport={(targets, overwrite) =>
              api.previewImport(effectiveRoot, {
                source: { tool: draft.tool, scope: draft.scope, id: draft.id },
                targets,
                overwrite,
              })
            }
            onImport={async (targets, overwrite) => {
              const result = await api.importSkill(effectiveRoot, {
                source: {
                  tool: draft.tool,
                  scope: draft.scope,
                  id: draft.id,
                },
                targets,
                overwrite,
              });
              pushToast("success", "Import finished");
              if (currentMode) await refreshWorkspace(currentMode);
              return result;
            }}
          />
        )}
      </main>

      {toasts.length > 0 && (
        <div className="toasts" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.kind}`}>
              <span className="toast-dot" />
              <span className="msg">{t.text}</span>
              <button type="button" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function basename(path: string): string {
  const parts = path.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || path;
}
