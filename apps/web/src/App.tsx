import { useCallback, useEffect, useRef, useState } from "react";
import { api, type ImportPlan, type ImportResult, type ScopeMode, type Skill, type SkillTool, type Workspace } from "./api";
import { modeToScope, parseHash, toolLabel, viewToHash, type Mode, type View } from "./nav";
import {
  forgetProject,
  loadRecentProjects,
  projectBasename,
  rememberProject,
} from "./recent-projects";
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

const UNSAVED_PROMPT = "You have unsaved changes to this skill. Discard them?";

export function App() {
  const [root, setRoot] = useState(() => localStorage.getItem("coactl.root") || "");
  const [recent, setRecent] = useState<string[]>(() => {
    const list = loadRecentProjects();
    const current = localStorage.getItem("coactl.root")?.trim();
    // Seed the list with the active root so the first switch has something useful.
    return current && !list.includes(current) ? rememberProject(current) : list;
  });
  const [view, setView] = useState<View>(() => {
    const fromHash = parseHash(window.location.hash);
    if (!fromHash) return { screen: "mode" };
    // Deep links into Project mode need a root; fall back to the gate.
    if ("mode" in fromHash && fromHash.mode === "project" && !localStorage.getItem("coactl.root")) {
      return { screen: "project-gate" };
    }
    return fromHash;
  });
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillsVersion, setSkillsVersion] = useState(0);
  const [draft, setDraft] = useState<Skill | null>(null);
  const [savedContents, setSavedContents] = useState<string | null>(null);
  const [showAllInstalled, setShowAllInstalled] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busy, setBusy] = useState(false);
  const toastId = useRef(0);

  const effectiveRoot = root.trim() || ".";
  const projectRootSet = Boolean(root.trim());

  const dirty =
    view.screen === "skill" &&
    draft !== null &&
    savedContents !== null &&
    draft.contents !== savedContents;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const viewRef = useRef(view);
  viewRef.current = view;

  /** All in-app navigation goes through here so unsaved edits can veto it. */
  const navigate = useCallback((next: View) => {
    if (dirtyRef.current && !window.confirm(UNSAVED_PROMPT)) return;
    setView(next);
  }, []);

  // Keep the URL hash in sync with the current view (deep links, refresh).
  useEffect(() => {
    const hash = viewToHash(view);
    if (window.location.hash !== hash) {
      history.replaceState(null, "", hash);
    }
  }, [view]);

  // Back/forward buttons and hand-edited hashes.
  useEffect(() => {
    function onHashChange() {
      const current = viewRef.current;
      const parsed = parseHash(window.location.hash);
      if (!parsed || (dirtyRef.current && !window.confirm(UNSAVED_PROMPT))) {
        history.replaceState(null, "", viewToHash(current));
        return;
      }
      setView(parsed);
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Warn before closing/reloading the tab with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

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
  }, [view, effectiveRoot, pushToast, skillsVersion]);

  useEffect(() => {
    if (view.screen !== "skill") {
      setDraft(null);
      setSavedContents(null);
      return;
    }
    const scope = modeToScope(view.mode);
    let cancelled = false;
    setBusy(true);
    void api
      .getSkill(effectiveRoot, view.tool, view.id, scope, view.path)
      .then((res) => {
        if (!cancelled) {
          setDraft(res.skill);
          setSavedContents(res.skill.contents);
        }
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

  function rememberRoot(path: string) {
    const trimmed = path.trim();
    if (!trimmed) return;
    setRecent(rememberProject(trimmed));
  }

  function selectProject(path: string) {
    const trimmed = path.trim();
    if (!trimmed) return;
    setRoot(trimmed);
    rememberRoot(trimmed);
  }

  function goMode(mode: Mode) {
    if (mode === "project") {
      // Gate only when no active root; otherwise continue into tools.
      if (!root.trim()) {
        navigate({ screen: "project-gate" });
        return;
      }
      rememberRoot(root);
      navigate({ screen: "tools", mode });
      return;
    }
    navigate({ screen: "tools", mode });
  }

  async function handlePickFolder() {
    try {
      const { path } = await api.pickFolder();
      selectProject(path);
    } catch (err) {
      pushToast("error", (err as Error).message);
    }
  }

  function handleForgetRecent(path: string) {
    setRecent(forgetProject(path));
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
      navigate({
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
      setSavedContents(skill.contents);
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

  async function handleBulkDelete(rows: Skill[]) {
    const deletable = rows.filter((r) => !r.readOnly);
    const skippedReadOnly = rows.length - deletable.length;
    if (!deletable.length) {
      pushToast("error", "All selected skills are read-only.");
      return;
    }
    const names = deletable.map((r) => r.id).join(", ");
    if (!confirm(`Delete ${deletable.length} skill${deletable.length === 1 ? "" : "s"} (${names})? This removes their folders.`)) {
      return;
    }
    setBusy(true);
    let ok = 0;
    const errors: string[] = [];
    for (const r of deletable) {
      try {
        await api.deleteSkill(effectiveRoot, r.tool, r.id, r.scope, r.filePath);
        ok += 1;
      } catch (err) {
        errors.push(`${r.id}: ${(err as Error).message}`);
      }
    }
    setBusy(false);
    setSkillsVersion((v) => v + 1);
    if (currentMode) void refreshWorkspace(currentMode);
    if (errors.length) {
      pushToast("error", `Deleted ${ok}, failed ${errors.length}: ${errors.join("; ")}`);
    } else {
      const skipNote = skippedReadOnly ? ` (skipped ${skippedReadOnly} read-only)` : "";
      pushToast("success", `Deleted ${ok} skill${ok === 1 ? "" : "s"}${skipNote}`);
    }
  }

  async function handleBulkPreview(
    sources: Skill[],
    targets: Array<{ tool: SkillTool; scope: ScopeMode }>,
    overwrite: boolean,
  ): Promise<ImportPlan["plan"]> {
    const plan: ImportPlan["plan"] = [];
    for (const s of sources) {
      const res = await api.previewImport(effectiveRoot, {
        source: { tool: s.tool, scope: s.scope, id: s.id },
        targets,
        overwrite,
      });
      plan.push(...res.plan);
    }
    return plan;
  }

  async function handleBulkImport(
    sources: Skill[],
    targets: Array<{ tool: SkillTool; scope: ScopeMode }>,
    overwrite: boolean,
  ): Promise<ImportResult["results"]> {
    setBusy(true);
    const results: ImportResult["results"] = [];
    try {
      for (const s of sources) {
        const res = await api.importSkill(effectiveRoot, {
          source: { tool: s.tool, scope: s.scope, id: s.id },
          targets,
          overwrite,
        });
        results.push(...res.results);
      }
    } finally {
      setBusy(false);
    }
    const written = results.filter((r) => r.status === "written").length;
    const skipped = results.filter((r) => r.status === "skipped").length;
    const failed = results.filter((r) => r.status === "error").length;
    pushToast(
      failed ? "error" : "success",
      `Import finished: ${written} written, ${skipped} skipped${failed ? `, ${failed} failed` : ""}`,
    );
    if (currentMode) void refreshWorkspace(currentMode);
    return results;
  }

  const crumbs: Array<{ label: string; onClick?: () => void }> = [];
  if (view.screen !== "mode") {
    crumbs.push({ label: "Home", onClick: () => navigate({ screen: "mode" }) });
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
      onClick: () => navigate({ screen: "tools", mode: view.mode }),
    });
  }
  if (view.screen === "resources" || view.screen === "skills" || view.screen === "skill") {
    crumbs.push({
      label: toolLabel(view.tool),
      // Soft-skip Resources: tool crumb goes to skills; resources URL still works for Phase B.
      onClick: () => navigate({ screen: "skills", mode: view.mode, tool: view.tool }),
    });
  }
  if (view.screen === "resources") {
    crumbs.push({ label: "Resources" });
  }
  if (view.screen === "skills" || view.screen === "skill") {
    crumbs.push({
      label: "Skills",
      onClick: () => navigate({ screen: "skills", mode: view.mode, tool: view.tool }),
    });
  }
  if (view.screen === "skill") {
    crumbs.push({ label: view.id });
  }

  const showRootControl =
    view.screen === "project-gate" || currentMode === "project" || view.screen === "skill";
  const rootControlForImportOnly = currentMode === "global" && view.screen === "skill";

  return (
    <div className="app">
      <header className="topbar">
        <button type="button" className="brand" onClick={() => navigate({ screen: "mode" })}>
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
            {rootControlForImportOnly && (
              <span className="root-control-label" title="Needed for project import destinations">
                Project root
              </span>
            )}
            {(recent.length > 0 || root.trim()) && (
              <select
                className="recent-select"
                aria-label="Switch project"
                value={root.trim()}
                title={root.trim() || undefined}
                onChange={(e) => {
                  if (!e.target.value) return;
                  selectProject(e.target.value);
                }}
              >
                {!root.trim() && <option value="">Select…</option>}
                {!recent.includes(root.trim()) && root.trim() && (
                  <option value={root.trim()}>{projectBasename(root.trim())}</option>
                )}
                {recent.map((path) => (
                  <option key={path} value={path}>
                    {projectBasename(path)}
                  </option>
                ))}
              </select>
            )}
            <button type="button" onClick={() => void handlePickFolder()}>
              Browse…
            </button>
            {(currentMode === "project" || view.screen === "project-gate") && (
              <button
                type="button"
                className="ghost"
                title="Open project picker"
                onClick={() => navigate({ screen: "project-gate" })}
              >
                Projects
              </button>
            )}
          </div>
        )}

        {currentMode && (
          <button
            type="button"
            className="ghost"
            onClick={() => {
              if (currentMode === "project" && root.trim()) rememberRoot(root);
              void refreshWorkspace(currentMode);
            }}
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
            recent={recent}
            onRootChange={setRoot}
            onPickFolder={() => void handlePickFolder()}
            onSelectRecent={(path) => {
              selectProject(path);
              navigate({ screen: "tools", mode: "project" });
            }}
            onForgetRecent={handleForgetRecent}
            onContinue={() => {
              if (!root.trim()) return;
              rememberRoot(root);
              navigate({ screen: "tools", mode: "project" });
            }}
          />
        )}

        {view.screen === "tools" && workspace && (
          <ToolsView
            mode={view.mode}
            workspace={workspace}
            showAllInstalled={showAllInstalled}
            onShowAllInstalled={setShowAllInstalled}
            onSelectTool={(tool) => navigate({ screen: "skills", mode: view.mode, tool })}
          />
        )}

        {view.screen === "resources" && workspace && (
          <ResourcesView
            mode={view.mode}
            tool={view.tool}
            workspace={workspace}
            onSelectSkills={() => navigate({ screen: "skills", mode: view.mode, tool: view.tool })}
          />
        )}

        {view.screen === "skills" && workspace && (
          <SkillsListView
            key={`${view.mode}:${view.tool}`}
            mode={view.mode}
            tool={view.tool}
            skills={skills}
            workspace={workspace}
            projectRootSet={projectRootSet}
            busy={busy}
            onBulkDelete={handleBulkDelete}
            onBulkPreview={handleBulkPreview}
            onBulkImport={handleBulkImport}
            onOpen={(skill) =>
              navigate({
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
            dirty={dirty}
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
  return projectBasename(path);
}
