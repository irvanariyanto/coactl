import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  ApiError,
  type AuthStatus,
  type Command,
  type CommandImportPlan,
  type CommandImportResult,
  type CommandTool,
  type ImportPlan,
  type ImportResult,
  type ProfileState,
  type Rule,
  type RuleImportPlan,
  type RuleImportResult,
  type RuleTool,
  type ScopeMode,
  type Skill,
  type SkillTool,
  type Workflow,
  type WorkflowImportPlan,
  type WorkflowImportResult,
  type WorkflowTool,
  type Workspace,
} from "./api";
import { ResourceKindSwitcher } from "./components/ResourceKindSwitcher";
import { AppSidebar } from "./components/AppSidebar";
import {
  modeToScope,
  parseHash,
  resourceKindListView,
  supportsCommands,
  supportsWorkflows,
  toolLabel,
  viewResourceKind,
  viewToHash,
  type Mode,
  type ResourceKind,
  type View,
} from "./nav";
import {
  forgetProject,
  loadRecentProjects,
  projectBasename,
  rememberProject,
} from "./recent-projects";
import { preferredResourceKind, rememberResourceNav } from "./recent-resource-nav";
import { clearDraft, loadDraft, saveDraft } from "./draft-store";
import { CommandDetailView } from "./views/CommandDetailView";
import { AuthSettingsPanel } from "./views/AuthSettingsPanel";
import { CommandsListView } from "./views/CommandsListView";
import { ModeHomeView } from "./views/ModeHomeView";
import { ProjectGateView } from "./views/ProjectGateView";
import { ProfileDataPanel } from "./views/ProfileDataPanel";
import { ResourcesView } from "./views/ResourcesView";
import { RuleDetailView } from "./views/RuleDetailView";
import { RulesListView } from "./views/RulesListView";
import { SkillDetailView } from "./views/SkillDetailView";
import { SkillsListView } from "./views/SkillsListView";
import { ToolsView } from "./views/ToolsView";
import { UnlockView } from "./views/UnlockView";
import { WorkflowDetailView } from "./views/WorkflowDetailView";
import { WorkflowsListView } from "./views/WorkflowsListView";

interface Toast {
  id: number;
  kind: "success" | "error";
  text: string;
  action?: { label: string; onClick: () => void };
}

const UNSAVED_PROMPT = "You have unsaved changes. Discard them?";

export function App() {
  const [root, setRoot] = useState(() => localStorage.getItem("coactl.root") || "");
  const [recent, setRecent] = useState<string[]>(() => {
    const list = loadRecentProjects();
    const current = localStorage.getItem("coactl.root")?.trim();
    return current && !list.includes(current) ? rememberProject(current) : list;
  });
  const [view, setView] = useState<View>(() => {
    const fromHash = parseHash(window.location.hash);
    if (!fromHash) return { screen: "mode" };
    if ("mode" in fromHash && fromHash.mode === "project" && !localStorage.getItem("coactl.root")) {
      return { screen: "project-gate" };
    }
    return fromHash;
  });
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillsVersion, setSkillsVersion] = useState(0);
  const [rules, setRules] = useState<Rule[]>([]);
  const [rulesVersion, setRulesVersion] = useState(0);
  const [commands, setCommands] = useState<Command[]>([]);
  const [commandsVersion, setCommandsVersion] = useState(0);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [workflowsVersion, setWorkflowsVersion] = useState(0);
  const [draft, setDraft] = useState<Skill | null>(null);
  const [ruleDraft, setRuleDraft] = useState<Rule | null>(null);
  const [commandDraft, setCommandDraft] = useState<Command | null>(null);
  const [workflowDraft, setWorkflowDraft] = useState<Workflow | null>(null);
  const [savedContents, setSavedContents] = useState<string | null>(null);
  const [pendingDraft, setPendingDraft] = useState<string | null>(null);
  const [showAllInstalled, setShowAllInstalled] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busy, setBusy] = useState(false);
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const toastId = useRef(0);
  const profileLoaded = useRef(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const effectiveRoot = root.trim() || ".";
  const projectRootSet = Boolean(root.trim());

  const dirty =
    (view.screen === "skill" &&
      draft !== null &&
      savedContents !== null &&
      draft.contents !== savedContents) ||
    (view.screen === "rule" &&
      ruleDraft !== null &&
      savedContents !== null &&
      ruleDraft.contents !== savedContents) ||
    (view.screen === "command" &&
      commandDraft !== null &&
      savedContents !== null &&
      commandDraft.contents !== savedContents) ||
    (view.screen === "workflow" &&
      workflowDraft !== null &&
      savedContents !== null &&
      workflowDraft.contents !== savedContents);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const viewRef = useRef(view);
  viewRef.current = view;

  const navigate = useCallback((next: View) => {
    if (dirtyRef.current && !window.confirm(UNSAVED_PROMPT)) return;
    setView(next);
  }, []);

  useEffect(() => {
    const hash = viewToHash(view);
    if (window.location.hash !== hash) {
      history.replaceState(null, "", hash);
    }
  }, [view]);

  useEffect(() => {
    const kind = viewResourceKind(view);
    if (!kind || !("mode" in view) || !("tool" in view)) return;
    rememberResourceNav(view.mode, view.tool, kind);
  }, [view]);

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
    view.screen === "mode" ||
    view.screen === "profile" ||
    view.screen === "security" ||
    view.screen === "project-gate"
      ? null
      : view.mode;
  const authLocked = Boolean(auth?.enabled && !auth.unlocked);

  const pushToast = useCallback(
    (kind: Toast["kind"], text: string, action?: Toast["action"]) => {
      const id = ++toastId.current;
      setToasts((prev) => [...prev.slice(-3), { id, kind, text, action }]);
      window.setTimeout(
        () => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        },
        action ? 12000 : kind === "error" ? 8000 : 4000,
      );
    },
    [],
  );

  const dismissToast = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  const handleApiError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && (err.status === 401 || err.code === "AUTH_REQUIRED")) {
        setAuth((prev) =>
          prev ? { ...prev, enabled: true, unlocked: false } : { enabled: true, unlocked: false, authFilePath: "" },
        );
        return;
      }
      pushToast("error", (err as Error).message);
    },
    [pushToast],
  );

  const refreshWorkspace = useCallback(
    async (mode: Mode) => {
      setBusy(true);
      try {
        setWorkspace(await api.workspace(effectiveRoot, mode));
      } catch (err) {
        handleApiError(err);
      } finally {
        setBusy(false);
      }
    },
    [effectiveRoot, handleApiError],
  );

  useEffect(() => {
    let cancelled = false;
    void api
      .authStatus()
      .then((status) => {
        if (!cancelled) setAuth(status);
      })
      .catch((err) => {
        if (!cancelled) pushToast("error", (err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [pushToast]);

  useEffect(() => {
    localStorage.setItem("coactl.root", root.trim());
  }, [root]);

  useEffect(() => {
    if (!auth || authLocked || profileLoaded.current) return;
    profileLoaded.current = true;
    void api
      .profile()
      .then(async (stored) => {
        if (!stored.activeProject && stored.recentProjects.length === 0 && (root.trim() || recent.length)) {
          const migrated = await api.saveProfile({
            activeProject: root.trim() || null,
            recentProjects: recent,
          });
          setProfile(migrated);
          return;
        }
        setProfile(stored);
        setRoot(stored.activeProject ?? "");
        setRecent(stored.recentProjects);
        localStorage.setItem("coactl.root", stored.activeProject ?? "");
        localStorage.setItem("coactl.recentRoots", JSON.stringify(stored.recentProjects));
      })
      .catch((err) => {
        profileLoaded.current = false;
        pushToast("error", (err as Error).message);
      });
  }, [auth, authLocked, pushToast, recent, root]);

  useEffect(() => {
    if (authLocked || !currentMode) return;
    void refreshWorkspace(currentMode);
  }, [authLocked, currentMode, refreshWorkspace]);

  useEffect(() => {
    if (authLocked) return;
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
  }, [authLocked, view, effectiveRoot, pushToast, skillsVersion]);

  useEffect(() => {
    if (authLocked) return;
    if (view.screen !== "rules" && view.screen !== "rule") return;
    const scope = modeToScope(view.mode);
    let cancelled = false;
    setBusy(true);
    void api
      .listRules(effectiveRoot, view.tool, scope)
      .then((res) => {
        if (!cancelled) setRules(res.rules);
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
  }, [authLocked, view, effectiveRoot, pushToast, rulesVersion]);

  useEffect(() => {
    if (authLocked) return;
    if (view.screen !== "commands" && view.screen !== "command") return;
    const scope = modeToScope(view.mode);
    let cancelled = false;
    setBusy(true);
    void api
      .listCommands(effectiveRoot, view.tool, scope)
      .then((res) => {
        if (!cancelled) setCommands(res.commands);
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
  }, [authLocked, view, effectiveRoot, pushToast, commandsVersion]);

  useEffect(() => {
    if (authLocked) return;
    if (view.screen !== "workflows" && view.screen !== "workflow") return;
    const scope = modeToScope(view.mode);
    let cancelled = false;
    setBusy(true);
    void api
      .listWorkflows(effectiveRoot, view.tool, scope)
      .then((res) => {
        if (!cancelled) setWorkflows(res.workflows);
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
  }, [authLocked, view, effectiveRoot, pushToast, workflowsVersion]);

  useEffect(() => {
    if (authLocked) return;
    if (view.screen !== "skill") {
      setDraft(null);
      if (view.screen !== "rule" && view.screen !== "command" && view.screen !== "workflow") {
        setSavedContents(null);
        setPendingDraft(null);
      }
      return;
    }
    const scope = modeToScope(view.mode);
    let cancelled = false;
    setBusy(true);
    setPendingDraft(null);
    void api
      .getSkill(effectiveRoot, view.tool, view.id, scope, view.path)
      .then((res) => {
        if (cancelled) return;
        setDraft(res.skill);
        setSavedContents(res.skill.contents);
        const local = loadDraft(
          "skill",
          res.skill.tool,
          res.skill.scope,
          res.skill.id,
          res.skill.filePath,
        );
        setPendingDraft(local && local !== res.skill.contents ? local : null);
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
  }, [authLocked, view, effectiveRoot, pushToast]);

  useEffect(() => {
    if (authLocked) return;
    if (view.screen !== "rule") {
      setRuleDraft(null);
      return;
    }
    const scope = modeToScope(view.mode);
    let cancelled = false;
    setBusy(true);
    setPendingDraft(null);
    void api
      .getRule(effectiveRoot, view.tool, view.id, scope, view.path)
      .then((res) => {
        if (cancelled) return;
        setRuleDraft(res.rule);
        setSavedContents(res.rule.contents);
        const local = loadDraft(
          "rule",
          res.rule.tool,
          res.rule.scope,
          res.rule.id,
          res.rule.filePath,
        );
        setPendingDraft(local && local !== res.rule.contents ? local : null);
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
  }, [authLocked, view, effectiveRoot, pushToast]);

  useEffect(() => {
    if (authLocked) return;
    if (view.screen !== "command") {
      setCommandDraft(null);
      return;
    }
    const scope = modeToScope(view.mode);
    let cancelled = false;
    setBusy(true);
    setPendingDraft(null);
    void api
      .getCommand(effectiveRoot, view.tool, view.id, scope, view.path)
      .then((res) => {
        if (cancelled) return;
        setCommandDraft(res.command);
        setSavedContents(res.command.contents);
        const local = loadDraft(
          "command",
          res.command.tool,
          res.command.scope,
          res.command.id,
          res.command.filePath,
        );
        setPendingDraft(local && local !== res.command.contents ? local : null);
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
  }, [authLocked, view, effectiveRoot, pushToast]);

  useEffect(() => {
    if (authLocked) return;
    if (view.screen !== "workflow") {
      setWorkflowDraft(null);
      return;
    }
    const scope = modeToScope(view.mode);
    let cancelled = false;
    setBusy(true);
    setPendingDraft(null);
    void api
      .getWorkflow(effectiveRoot, view.tool, view.id, scope, view.path)
      .then((res) => {
        if (cancelled) return;
        setWorkflowDraft(res.workflow);
        setSavedContents(res.workflow.contents);
        const local = loadDraft(
          "workflow",
          res.workflow.tool,
          res.workflow.scope,
          res.workflow.id,
          res.workflow.filePath,
        );
        setPendingDraft(local && local !== res.workflow.contents ? local : null);
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
  }, [authLocked, view, effectiveRoot, pushToast]);

  // Autosave dirty editor contents to localStorage (survives refresh).
  useEffect(() => {
    if (!dirty) return;
    const handle = window.setTimeout(() => {
      if (view.screen === "skill" && draft) {
        saveDraft("skill", draft.tool, draft.scope, draft.id, draft.filePath, draft.contents);
      } else if (view.screen === "rule" && ruleDraft) {
        saveDraft(
          "rule",
          ruleDraft.tool,
          ruleDraft.scope,
          ruleDraft.id,
          ruleDraft.filePath,
          ruleDraft.contents,
        );
      } else if (view.screen === "command" && commandDraft) {
        saveDraft(
          "command",
          commandDraft.tool,
          commandDraft.scope,
          commandDraft.id,
          commandDraft.filePath,
          commandDraft.contents,
        );
      } else if (view.screen === "workflow" && workflowDraft) {
        saveDraft(
          "workflow",
          workflowDraft.tool,
          workflowDraft.scope,
          workflowDraft.id,
          workflowDraft.filePath,
          workflowDraft.contents,
        );
      }
    }, 400);
    return () => window.clearTimeout(handle);
  }, [dirty, view.screen, draft, ruleDraft, commandDraft, workflowDraft]);

  function rememberRoot(path: string) {
    const trimmed = path.trim();
    if (!trimmed) return;
    const next = rememberProject(trimmed);
    setRecent(next);
    void api
      .saveProfile({ activeProject: trimmed, recentProjects: next })
      .then(setProfile)
      .catch((err) => pushToast("error", (err as Error).message));
  }

  function selectProject(path: string) {
    const trimmed = path.trim();
    if (!trimmed) return;
    setRoot(trimmed);
    rememberRoot(trimmed);
  }

  function goMode(mode: Mode) {
    if (mode === "project") {
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

  function openTool(tool: SkillTool, mode: Mode) {
    const kind = preferredResourceKind(mode, tool);
    navigate(resourceKindListView(mode, tool, kind));
  }

  function openResourceKind(mode: Mode, tool: SkillTool, kind: ResourceKind) {
    rememberResourceNav(mode, tool, kind);
    navigate(resourceKindListView(mode, tool, kind));
  }

  const activeResourceKind = viewResourceKind(view);

  async function handlePickFolder() {
    try {
      const result = await api.pickFolder();
      if ("cancelled" in result) return;
      selectProject(result.path);
    } catch (err) {
      pushToast("error", (err as Error).message);
    }
  }

  function handleForgetRecent(path: string) {
    const next = forgetProject(path);
    setRecent(next);
    void api
      .saveProfile({ recentProjects: next })
      .then(setProfile)
      .catch((err) => pushToast("error", (err as Error).message));
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

  async function handleCreateRule(id: string) {
    if (view.screen !== "rules") return;
    setBusy(true);
    try {
      const { rule } = await api.scaffoldRule(effectiveRoot, {
        id,
        tool: view.tool,
        scope: modeToScope(view.mode),
        save: true,
      });
      pushToast("success", `Created ${rule.id}`);
      navigate({
        screen: "rule",
        mode: view.mode,
        tool: view.tool,
        id: rule.id,
        path: rule.filePath,
      });
    } catch (err) {
      pushToast("error", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateCommand(id: string) {
    if (view.screen !== "commands") return;
    setBusy(true);
    try {
      const { command } = await api.scaffoldCommand(effectiveRoot, {
        id,
        tool: view.tool,
        scope: modeToScope(view.mode),
        save: true,
      });
      pushToast("success", `Created ${command.id}`);
      navigate({
        screen: "command",
        mode: view.mode,
        tool: view.tool,
        id: command.id,
        path: command.filePath,
      });
    } catch (err) {
      pushToast("error", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateWorkflow(id: string) {
    if (view.screen !== "workflows") return;
    setBusy(true);
    try {
      const { workflow } = await api.scaffoldWorkflow(effectiveRoot, {
        id,
        tool: view.tool,
        scope: modeToScope(view.mode),
        save: true,
      });
      pushToast("success", `Created ${workflow.id}`);
      navigate({
        screen: "workflow",
        mode: view.mode,
        tool: view.tool,
        id: workflow.id,
        path: workflow.filePath,
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
      setPendingDraft(null);
      clearDraft("skill", skill.tool, skill.scope, skill.id, skill.filePath);
      pushToast("success", "Saved");
    } catch (err) {
      pushToast("error", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveRule() {
    if (!ruleDraft || view.screen !== "rule") return;
    setBusy(true);
    try {
      const { rule } = await api.saveRule(
        effectiveRoot,
        {
          tool: ruleDraft.tool,
          scope: ruleDraft.scope,
          id: ruleDraft.id,
          contents: ruleDraft.contents,
          filePath: ruleDraft.filePath,
        },
        false,
      );
      setRuleDraft(rule);
      setSavedContents(rule.contents);
      setPendingDraft(null);
      clearDraft("rule", rule.tool, rule.scope, rule.id, rule.filePath);
      pushToast("success", "Saved");
    } catch (err) {
      pushToast("error", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveCommand() {
    if (!commandDraft || view.screen !== "command") return;
    setBusy(true);
    try {
      const { command } = await api.saveCommand(
        effectiveRoot,
        {
          tool: commandDraft.tool,
          scope: commandDraft.scope,
          id: commandDraft.id,
          contents: commandDraft.contents,
          filePath: commandDraft.filePath,
        },
        false,
      );
      setCommandDraft(command);
      setSavedContents(command.contents);
      setPendingDraft(null);
      clearDraft("command", command.tool, command.scope, command.id, command.filePath);
      pushToast("success", "Saved");
    } catch (err) {
      pushToast("error", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveWorkflow() {
    if (!workflowDraft || view.screen !== "workflow") return;
    setBusy(true);
    try {
      const { workflow } = await api.saveWorkflow(
        effectiveRoot,
        {
          tool: workflowDraft.tool,
          scope: workflowDraft.scope,
          id: workflowDraft.id,
          contents: workflowDraft.contents,
          filePath: workflowDraft.filePath,
        },
        false,
      );
      setWorkflowDraft(workflow);
      setSavedContents(workflow.contents);
      setPendingDraft(null);
      clearDraft("workflow", workflow.tool, workflow.scope, workflow.id, workflow.filePath);
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
    const snapshot = { ...draft };
    const listView = { screen: "skills" as const, mode: view.mode, tool: view.tool };
    setBusy(true);
    try {
      await api.deleteSkill(
        effectiveRoot,
        snapshot.tool,
        snapshot.id,
        snapshot.scope,
        snapshot.filePath,
      );
      clearDraft("skill", snapshot.tool, snapshot.scope, snapshot.id, snapshot.filePath);
      setPendingDraft(null);
      setView(listView);
      pushToast("success", `Deleted ${snapshot.id}`, {
        label: "Undo",
        onClick: () => {
          void (async () => {
            try {
              const { skill } = await api.saveSkill(
                effectiveRoot,
                {
                  tool: snapshot.tool,
                  scope: snapshot.scope,
                  id: snapshot.id,
                  contents: snapshot.contents,
                },
                true,
              );
              pushToast("success", `Restored ${skill.id}`);
              setSkillsVersion((v) => v + 1);
              setView({
                screen: "skill",
                mode: listView.mode,
                tool: listView.tool,
                id: skill.id,
                path: skill.filePath,
              });
            } catch (err) {
              pushToast("error", (err as Error).message);
            }
          })();
        },
      });
    } catch (err) {
      pushToast("error", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteRule() {
    if (!ruleDraft || view.screen !== "rule") return;
    if (!confirm(`Delete ${ruleDraft.tool}/${ruleDraft.id}?`)) return;
    const snapshot = { ...ruleDraft };
    const listView = { screen: "rules" as const, mode: view.mode, tool: view.tool };
    setBusy(true);
    try {
      await api.deleteRule(
        effectiveRoot,
        snapshot.tool,
        snapshot.id,
        snapshot.scope,
        snapshot.filePath,
      );
      clearDraft("rule", snapshot.tool, snapshot.scope, snapshot.id, snapshot.filePath);
      setPendingDraft(null);
      setView(listView);
      pushToast("success", `Deleted ${snapshot.id}`, {
        label: "Undo",
        onClick: () => {
          void (async () => {
            try {
              const { rule } = await api.saveRule(
                effectiveRoot,
                {
                  tool: snapshot.tool,
                  scope: snapshot.scope,
                  id: snapshot.id,
                  contents: snapshot.contents,
                },
                true,
              );
              pushToast("success", `Restored ${rule.id}`);
              setRulesVersion((v) => v + 1);
              setView({
                screen: "rule",
                mode: listView.mode,
                tool: listView.tool,
                id: rule.id,
                path: rule.filePath,
              });
            } catch (err) {
              pushToast("error", (err as Error).message);
            }
          })();
        },
      });
    } catch (err) {
      pushToast("error", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteCommand() {
    if (!commandDraft || view.screen !== "command") return;
    if (!confirm(`Delete ${commandDraft.tool}/${commandDraft.id}?`)) return;
    const snapshot = { ...commandDraft };
    const listView = { screen: "commands" as const, mode: view.mode, tool: view.tool };
    setBusy(true);
    try {
      await api.deleteCommand(
        effectiveRoot,
        snapshot.tool,
        snapshot.id,
        snapshot.scope,
        snapshot.filePath,
      );
      clearDraft("command", snapshot.tool, snapshot.scope, snapshot.id, snapshot.filePath);
      setPendingDraft(null);
      setView(listView);
      pushToast("success", `Deleted ${snapshot.id}`, {
        label: "Undo",
        onClick: () => {
          void (async () => {
            try {
              const { command } = await api.saveCommand(
                effectiveRoot,
                {
                  tool: snapshot.tool,
                  scope: snapshot.scope,
                  id: snapshot.id,
                  contents: snapshot.contents,
                },
                true,
              );
              pushToast("success", `Restored ${command.id}`);
              setCommandsVersion((v) => v + 1);
              setView({
                screen: "command",
                mode: listView.mode,
                tool: listView.tool,
                id: command.id,
                path: command.filePath,
              });
            } catch (err) {
              pushToast("error", (err as Error).message);
            }
          })();
        },
      });
    } catch (err) {
      pushToast("error", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteWorkflow() {
    if (!workflowDraft || view.screen !== "workflow") return;
    if (!confirm(`Delete ${workflowDraft.tool}/${workflowDraft.id}?`)) return;
    const snapshot = { ...workflowDraft };
    const listView = { screen: "workflows" as const, mode: view.mode, tool: view.tool };
    setBusy(true);
    try {
      await api.deleteWorkflow(
        effectiveRoot,
        snapshot.tool,
        snapshot.id,
        snapshot.scope,
        snapshot.filePath,
      );
      clearDraft("workflow", snapshot.tool, snapshot.scope, snapshot.id, snapshot.filePath);
      setPendingDraft(null);
      setView(listView);
      pushToast("success", `Deleted ${snapshot.id}`, {
        label: "Undo",
        onClick: () => {
          void (async () => {
            try {
              const { workflow } = await api.saveWorkflow(
                effectiveRoot,
                {
                  tool: snapshot.tool,
                  scope: snapshot.scope,
                  id: snapshot.id,
                  contents: snapshot.contents,
                },
                true,
              );
              pushToast("success", `Restored ${workflow.id}`);
              setWorkflowsVersion((v) => v + 1);
              setView({
                screen: "workflow",
                mode: listView.mode,
                tool: listView.tool,
                id: workflow.id,
                path: workflow.filePath,
              });
            } catch (err) {
              pushToast("error", (err as Error).message);
            }
          })();
        },
      });
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
    if (
      !confirm(
        `Delete ${deletable.length} skill${deletable.length === 1 ? "" : "s"} (${names})? This removes their folders.`,
      )
    ) {
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

  async function handleBulkDeleteRules(rows: Rule[]) {
    if (!rows.length) return;
    const names = rows.map((r) => r.id).join(", ");
    if (
      !confirm(
        `Delete ${rows.length} rule${rows.length === 1 ? "" : "s"} (${names})? This removes the files.`,
      )
    ) {
      return;
    }
    setBusy(true);
    let ok = 0;
    const errors: string[] = [];
    for (const r of rows) {
      try {
        await api.deleteRule(effectiveRoot, r.tool, r.id, r.scope, r.filePath);
        ok += 1;
      } catch (err) {
        errors.push(`${r.id}: ${(err as Error).message}`);
      }
    }
    setBusy(false);
    setRulesVersion((v) => v + 1);
    if (currentMode) void refreshWorkspace(currentMode);
    if (errors.length) {
      pushToast("error", `Deleted ${ok}, failed ${errors.length}: ${errors.join("; ")}`);
    } else {
      pushToast("success", `Deleted ${ok} rule${ok === 1 ? "" : "s"}`);
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

  async function handleBulkPreviewRules(
    sources: Rule[],
    targets: Array<{ tool: RuleTool; scope: ScopeMode }>,
    overwrite: boolean,
  ): Promise<RuleImportPlan["plan"]> {
    const plan: RuleImportPlan["plan"] = [];
    for (const s of sources) {
      const res = await api.previewRuleImport(effectiveRoot, {
        source: { tool: s.tool, scope: s.scope, id: s.id },
        targets,
        overwrite,
      });
      plan.push(...res.plan);
    }
    return plan;
  }

  async function handleBulkImportRules(
    sources: Rule[],
    targets: Array<{ tool: RuleTool; scope: ScopeMode }>,
    overwrite: boolean,
  ): Promise<RuleImportResult["results"]> {
    setBusy(true);
    const results: RuleImportResult["results"] = [];
    try {
      for (const s of sources) {
        const res = await api.importRule(effectiveRoot, {
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
    setRulesVersion((v) => v + 1);
    return results;
  }

  async function handleBulkDeleteCommands(rows: Command[]) {
    if (!rows.length) return;
    const names = rows.map((r) => r.id).join(", ");
    if (
      !confirm(
        `Delete ${rows.length} command${rows.length === 1 ? "" : "s"} (${names})? This removes the files.`,
      )
    ) {
      return;
    }
    setBusy(true);
    let ok = 0;
    const errors: string[] = [];
    for (const r of rows) {
      try {
        await api.deleteCommand(effectiveRoot, r.tool, r.id, r.scope, r.filePath);
        ok += 1;
      } catch (err) {
        errors.push(`${r.id}: ${(err as Error).message}`);
      }
    }
    setBusy(false);
    setCommandsVersion((v) => v + 1);
    if (currentMode) void refreshWorkspace(currentMode);
    if (errors.length) {
      pushToast("error", `Deleted ${ok}, failed ${errors.length}: ${errors.join("; ")}`);
    } else {
      pushToast("success", `Deleted ${ok} command${ok === 1 ? "" : "s"}`);
    }
  }

  async function handleBulkPreviewCommands(
    sources: Command[],
    targets: Array<{ tool: CommandTool; scope: ScopeMode }>,
    overwrite: boolean,
  ): Promise<CommandImportPlan["plan"]> {
    const plan: CommandImportPlan["plan"] = [];
    for (const s of sources) {
      const res = await api.previewCommandImport(effectiveRoot, {
        source: { tool: s.tool, scope: s.scope, id: s.id },
        targets,
        overwrite,
      });
      plan.push(...res.plan);
    }
    return plan;
  }

  async function handleBulkImportCommands(
    sources: Command[],
    targets: Array<{ tool: CommandTool; scope: ScopeMode }>,
    overwrite: boolean,
  ): Promise<CommandImportResult["results"]> {
    setBusy(true);
    const results: CommandImportResult["results"] = [];
    try {
      for (const s of sources) {
        const res = await api.importCommand(effectiveRoot, {
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
    setCommandsVersion((v) => v + 1);
    return results;
  }

  async function handleBulkDeleteWorkflows(rows: Workflow[]) {
    if (!rows.length) return;
    const names = rows.map((r) => r.id).join(", ");
    if (
      !confirm(
        `Delete ${rows.length} workflow${rows.length === 1 ? "" : "s"} (${names})? This removes the files.`,
      )
    ) {
      return;
    }
    setBusy(true);
    let ok = 0;
    const errors: string[] = [];
    for (const r of rows) {
      try {
        await api.deleteWorkflow(effectiveRoot, r.tool, r.id, r.scope, r.filePath);
        ok += 1;
      } catch (err) {
        errors.push(`${r.id}: ${(err as Error).message}`);
      }
    }
    setBusy(false);
    setWorkflowsVersion((v) => v + 1);
    if (currentMode) void refreshWorkspace(currentMode);
    if (errors.length) {
      pushToast("error", `Deleted ${ok}, failed ${errors.length}: ${errors.join("; ")}`);
    } else {
      pushToast("success", `Deleted ${ok} workflow${ok === 1 ? "" : "s"}`);
    }
  }

  async function handleBulkPreviewWorkflows(
    sources: Workflow[],
    targets: Array<{ tool: WorkflowTool; scope: ScopeMode }>,
    overwrite: boolean,
  ): Promise<WorkflowImportPlan["plan"]> {
    const plan: WorkflowImportPlan["plan"] = [];
    for (const s of sources) {
      const res = await api.previewWorkflowImport(effectiveRoot, {
        source: { tool: s.tool, scope: s.scope, id: s.id },
        targets,
        overwrite,
      });
      plan.push(...res.plan);
    }
    return plan;
  }

  async function handleBulkImportWorkflows(
    sources: Workflow[],
    targets: Array<{ tool: WorkflowTool; scope: ScopeMode }>,
    overwrite: boolean,
  ): Promise<WorkflowImportResult["results"]> {
    setBusy(true);
    const results: WorkflowImportResult["results"] = [];
    try {
      for (const s of sources) {
        const res = await api.importWorkflow(effectiveRoot, {
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
    setWorkflowsVersion((v) => v + 1);
    return results;
  }

  const crumbs: Array<{ label: string; onClick?: () => void }> = [];
  if (view.screen !== "mode") {
    crumbs.push({ label: "Home", onClick: () => navigate({ screen: "mode" }) });
  }
  if (view.screen === "project-gate") {
    crumbs.push({ label: "Project" });
  }
  if (view.screen === "profile") {
    crumbs.push({ label: "Portable profile" });
  }
  if (view.screen === "security") {
    crumbs.push({ label: "Login & security" });
  }
  if (
    view.screen === "tools" ||
    view.screen === "resources" ||
    view.screen === "skills" ||
    view.screen === "skill" ||
    view.screen === "rules" ||
    view.screen === "rule" ||
    view.screen === "commands" ||
    view.screen === "command" ||
    view.screen === "workflows" ||
    view.screen === "workflow"
  ) {
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
  if (
    view.screen === "resources" ||
    view.screen === "skills" ||
    view.screen === "skill" ||
    view.screen === "rules" ||
    view.screen === "rule" ||
    view.screen === "commands" ||
    view.screen === "command" ||
    view.screen === "workflows" ||
    view.screen === "workflow"
  ) {
    crumbs.push({
      label: toolLabel(view.tool),
      onClick: () => navigate({ screen: "resources", mode: view.mode, tool: view.tool }),
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
  if (view.screen === "rules" || view.screen === "rule") {
    crumbs.push({
      label: "Rules",
      onClick: () => navigate({ screen: "rules", mode: view.mode, tool: view.tool }),
    });
  }
  if (view.screen === "rule") {
    crumbs.push({ label: view.id });
  }
  if (view.screen === "commands" || view.screen === "command") {
    crumbs.push({
      label: "Commands",
      onClick: () => navigate({ screen: "commands", mode: view.mode, tool: view.tool }),
    });
  }
  if (view.screen === "command") {
    crumbs.push({ label: view.id });
  }
  if (view.screen === "workflows" || view.screen === "workflow") {
    crumbs.push({
      label: "Workflows",
      onClick: () => navigate({ screen: "workflows", mode: view.mode, tool: view.tool }),
    });
  }
  if (view.screen === "workflow") {
    crumbs.push({ label: view.id });
  }

  const showRootControl =
    view.screen === "project-gate" ||
    currentMode === "project" ||
    view.screen === "skill" ||
    view.screen === "rule" ||
    view.screen === "command" ||
    view.screen === "workflow";
  const rootControlForImportOnly =
    currentMode === "global" &&
    (view.screen === "skill" ||
      view.screen === "rule" ||
      view.screen === "command" ||
      view.screen === "workflow");
  const activeTool = "tool" in view ? view.tool : null;

  function applyImportedProfile(next: ProfileState) {
    setProfile(next);
    setRoot(next.activeProject ?? "");
    setRecent(next.recentProjects);
    localStorage.setItem("coactl.root", next.activeProject ?? "");
    localStorage.setItem("coactl.recentRoots", JSON.stringify(next.recentProjects));
  }

  function closeSidebar() {
    setSidebarOpen(false);
    if (window.matchMedia("(max-width: 900px)").matches) {
      window.setTimeout(() => menuButtonRef.current?.focus(), 0);
    }
  }

  function navigateFromSidebar(next: View) {
    navigate(next);
    closeSidebar();
  }

  if (!auth) {
    return (
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <span className="logo">c</span>
            <span>
              coa<em>ctl</em>
            </span>
          </div>
        </header>
        <main className="content">
          <p className="muted">Checking login status…</p>
        </main>
      </div>
    );
  }

  if (auth.enabled && !auth.unlocked) {
    return <UnlockView onUnlocked={setAuth} />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <button
          ref={menuButtonRef}
          type="button"
          className="menu-toggle"
          aria-label="Open navigation"
          aria-expanded={sidebarOpen}
          aria-controls="app-sidebar"
          onClick={() => setSidebarOpen(true)}
        >
          <span />
          <span />
          <span />
        </button>
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

        {auth.enabled && (
          <button
            type="button"
            className="ghost"
            onClick={() => {
              void api
                .logout()
                .then((status) => setAuth(status))
                .catch((err) => pushToast("error", (err as Error).message));
            }}
          >
            Lock
          </button>
        )}
      </header>
      <div className="app-body">
        <div id="app-sidebar">
          <AppSidebar
            open={sidebarOpen}
            view={view}
            currentMode={currentMode}
            activeTool={activeTool}
            root={root}
            recent={recent}
            onClose={closeSidebar}
            onNavigate={navigateFromSidebar}
            onSelectMode={(mode) => {
              if (mode === "project") navigate({ screen: "project-gate" });
              else goMode(mode);
              closeSidebar();
            }}
            onSelectProject={(path) => {
              selectProject(path);
              navigate({ screen: "tools", mode: "project" });
              closeSidebar();
            }}
            onSelectResource={(kind) => {
              if (!currentMode || !activeTool) return;
              openResourceKind(currentMode, activeTool, kind);
              closeSidebar();
            }}
          />
        </div>

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

        {activeResourceKind && "tool" in view && "mode" in view && (
          <ResourceKindSwitcher
            mode={view.mode}
            tool={view.tool}
            active={activeResourceKind}
            onSelect={(kind) => openResourceKind(view.mode, view.tool, kind)}
          />
        )}

        {view.screen === "mode" && (
          <ModeHomeView onSelect={goMode} />
        )}

        {view.screen === "profile" && (
          <ProfileDataPanel profile={profile} onImported={applyImportedProfile} onToast={pushToast} />
        )}

        {view.screen === "security" && (
          <AuthSettingsPanel auth={auth} onAuthChange={setAuth} onToast={pushToast} />
        )}

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
            onSelectTool={(tool) => openTool(tool, view.mode)}
          />
        )}

        {view.screen === "resources" && workspace && (
          <ResourcesView
            mode={view.mode}
            tool={view.tool}
            workspace={workspace}
            onSelectSkills={() => openResourceKind(view.mode, view.tool, "skills")}
            onSelectRules={() => openResourceKind(view.mode, view.tool, "rules")}
            onSelectCommands={() => {
              if (supportsCommands(view.tool)) {
                openResourceKind(view.mode, view.tool, "commands");
              }
            }}
            onSelectWorkflows={() => {
              if (supportsWorkflows(view.tool)) {
                openResourceKind(view.mode, view.tool, "workflows");
              }
            }}
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
            onPreviewGitRepo={(input) => api.previewGitSkills(effectiveRoot, input)}
            onPreviewPack={(input) => api.previewPackSkills(effectiveRoot, input)}
            onPreviewSmart={(input) => api.previewSmartSkills(effectiveRoot, input)}
            onPickArchive={() => api.pickArchive()}
            onPreviewGitInstall={async (skillsToInstall, overwrite) => {
              const res = await api.previewGitInstall(effectiveRoot, {
                tool: view.tool,
                scope: modeToScope(view.mode),
                skills: skillsToInstall,
                overwrite,
              });
              return res.plan;
            }}
            onInstallGitSkills={async (skillsToInstall, overwrite) => {
              setBusy(true);
              try {
                const res = await api.installGitSkills(effectiveRoot, {
                  tool: view.tool,
                  scope: modeToScope(view.mode),
                  skills: skillsToInstall,
                  overwrite,
                });
                const written = res.results.filter((r) => r.status === "written").length;
                const skipped = res.results.filter((r) => r.status === "skipped").length;
                const failed = res.results.filter((r) => r.status === "error").length;
                pushToast(
                  failed ? "error" : "success",
                  `Git install: ${written} written, ${skipped} skipped${failed ? `, ${failed} failed` : ""}`,
                );
                setSkillsVersion((v) => v + 1);
                if (currentMode) void refreshWorkspace(currentMode);
                return res.results;
              } catch (err) {
                pushToast("error", (err as Error).message);
                throw err;
              } finally {
                setBusy(false);
              }
            }}
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
            pendingDraft={pendingDraft}
            onRestoreDraft={() => {
              if (!pendingDraft || !draft) return;
              setDraft({ ...draft, contents: pendingDraft });
              setPendingDraft(null);
            }}
            onDiscardDraft={() => {
              if (!draft) return;
              clearDraft("skill", draft.tool, draft.scope, draft.id, draft.filePath);
              setPendingDraft(null);
            }}
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
            onOpenWritten={(target) => {
              navigate({
                screen: "skill",
                mode: target.scope,
                tool: target.tool,
                id: target.id,
                path: target.filePath,
              });
            }}
          />
        )}

        {view.screen === "rules" && workspace && (
          <RulesListView
            key={`rules:${view.mode}:${view.tool}`}
            mode={view.mode}
            tool={view.tool}
            rules={rules}
            workspace={workspace}
            projectRootSet={projectRootSet}
            busy={busy}
            onBulkDelete={handleBulkDeleteRules}
            onBulkPreview={handleBulkPreviewRules}
            onBulkImport={handleBulkImportRules}
            onOpen={(rule) =>
              navigate({
                screen: "rule",
                mode: view.mode,
                tool: view.tool,
                id: rule.id,
                path: rule.filePath,
              })
            }
            onCreate={handleCreateRule}
          />
        )}

        {view.screen === "rule" && ruleDraft && workspace && (
          <RuleDetailView
            mode={view.mode}
            tool={view.tool}
            rule={ruleDraft}
            workspace={workspace}
            projectRootSet={projectRootSet}
            busy={busy}
            dirty={dirty}
            pendingDraft={pendingDraft}
            onRestoreDraft={() => {
              if (!pendingDraft || !ruleDraft) return;
              setRuleDraft({ ...ruleDraft, contents: pendingDraft });
              setPendingDraft(null);
            }}
            onDiscardDraft={() => {
              if (!ruleDraft) return;
              clearDraft("rule", ruleDraft.tool, ruleDraft.scope, ruleDraft.id, ruleDraft.filePath);
              setPendingDraft(null);
            }}
            onChangeContents={(contents) => setRuleDraft({ ...ruleDraft, contents })}
            onSave={handleSaveRule}
            onDelete={handleDeleteRule}
            onPreviewImport={(targets, overwrite) =>
              api.previewRuleImport(effectiveRoot, {
                source: { tool: ruleDraft.tool, scope: ruleDraft.scope, id: ruleDraft.id },
                targets,
                overwrite,
              })
            }
            onImport={async (targets, overwrite) => {
              const result = await api.importRule(effectiveRoot, {
                source: {
                  tool: ruleDraft.tool,
                  scope: ruleDraft.scope,
                  id: ruleDraft.id,
                },
                targets,
                overwrite,
              });
              pushToast("success", "Import finished");
              if (currentMode) await refreshWorkspace(currentMode);
              return result;
            }}
            onOpenWritten={(target) => {
              navigate({
                screen: "rule",
                mode: target.scope,
                tool: target.tool,
                id: target.id,
                path: target.filePath,
              });
            }}
          />
        )}

        {view.screen === "commands" && workspace && (
          <CommandsListView
            key={`commands:${view.mode}:${view.tool}`}
            mode={view.mode}
            tool={view.tool}
            commands={commands}
            workspace={workspace}
            projectRootSet={projectRootSet}
            busy={busy}
            onBulkDelete={handleBulkDeleteCommands}
            onBulkPreview={handleBulkPreviewCommands}
            onBulkImport={handleBulkImportCommands}
            onOpen={(command) =>
              navigate({
                screen: "command",
                mode: view.mode,
                tool: view.tool,
                id: command.id,
                path: command.filePath,
              })
            }
            onCreate={handleCreateCommand}
          />
        )}

        {view.screen === "command" && commandDraft && workspace && (
          <CommandDetailView
            mode={view.mode}
            tool={view.tool}
            command={commandDraft}
            workspace={workspace}
            projectRootSet={projectRootSet}
            busy={busy}
            dirty={dirty}
            pendingDraft={pendingDraft}
            onRestoreDraft={() => {
              if (!pendingDraft || !commandDraft) return;
              setCommandDraft({ ...commandDraft, contents: pendingDraft });
              setPendingDraft(null);
            }}
            onDiscardDraft={() => {
              if (!commandDraft) return;
              clearDraft(
                "command",
                commandDraft.tool,
                commandDraft.scope,
                commandDraft.id,
                commandDraft.filePath,
              );
              setPendingDraft(null);
            }}
            onChangeContents={(contents) => setCommandDraft({ ...commandDraft, contents })}
            onSave={handleSaveCommand}
            onDelete={handleDeleteCommand}
            onPreviewImport={(targets, overwrite) =>
              api.previewCommandImport(effectiveRoot, {
                source: {
                  tool: commandDraft.tool,
                  scope: commandDraft.scope,
                  id: commandDraft.id,
                },
                targets,
                overwrite,
              })
            }
            onImport={async (targets, overwrite) => {
              const result = await api.importCommand(effectiveRoot, {
                source: {
                  tool: commandDraft.tool,
                  scope: commandDraft.scope,
                  id: commandDraft.id,
                },
                targets,
                overwrite,
              });
              pushToast("success", "Import finished");
              if (currentMode) await refreshWorkspace(currentMode);
              return result;
            }}
            onOpenWritten={(target) => {
              if (!supportsCommands(target.tool)) return;
              navigate({
                screen: "command",
                mode: target.scope,
                tool: target.tool,
                id: target.id,
                path: target.filePath,
              });
            }}
          />
        )}

        {view.screen === "workflows" && workspace && (
          <WorkflowsListView
            key={`workflows:${view.mode}:${view.tool}`}
            mode={view.mode}
            tool={view.tool}
            workflows={workflows}
            workspace={workspace}
            projectRootSet={projectRootSet}
            busy={busy}
            onBulkDelete={handleBulkDeleteWorkflows}
            onBulkPreview={handleBulkPreviewWorkflows}
            onBulkImport={handleBulkImportWorkflows}
            onOpen={(workflow) =>
              navigate({
                screen: "workflow",
                mode: view.mode,
                tool: view.tool,
                id: workflow.id,
                path: workflow.filePath,
              })
            }
            onCreate={handleCreateWorkflow}
          />
        )}

        {view.screen === "workflow" && workflowDraft && workspace && (
          <WorkflowDetailView
            mode={view.mode}
            tool={view.tool}
            workflow={workflowDraft}
            workspace={workspace}
            projectRootSet={projectRootSet}
            busy={busy}
            dirty={dirty}
            pendingDraft={pendingDraft}
            onRestoreDraft={() => {
              if (!pendingDraft || !workflowDraft) return;
              setWorkflowDraft({ ...workflowDraft, contents: pendingDraft });
              setPendingDraft(null);
            }}
            onDiscardDraft={() => {
              if (!workflowDraft) return;
              clearDraft(
                "workflow",
                workflowDraft.tool,
                workflowDraft.scope,
                workflowDraft.id,
                workflowDraft.filePath,
              );
              setPendingDraft(null);
            }}
            onChangeContents={(contents) => setWorkflowDraft({ ...workflowDraft, contents })}
            onSave={handleSaveWorkflow}
            onDelete={handleDeleteWorkflow}
            onPreviewImport={(targets, overwrite) =>
              api.previewWorkflowImport(effectiveRoot, {
                source: {
                  tool: workflowDraft.tool,
                  scope: workflowDraft.scope,
                  id: workflowDraft.id,
                },
                targets,
                overwrite,
              })
            }
            onImport={async (targets, overwrite) => {
              const result = await api.importWorkflow(effectiveRoot, {
                source: {
                  tool: workflowDraft.tool,
                  scope: workflowDraft.scope,
                  id: workflowDraft.id,
                },
                targets,
                overwrite,
              });
              pushToast("success", "Import finished");
              if (currentMode) await refreshWorkspace(currentMode);
              return result;
            }}
            onOpenWritten={(target) => {
              if (!supportsWorkflows(target.tool)) return;
              navigate({
                screen: "workflow",
                mode: target.scope,
                tool: target.tool,
                id: target.id,
                path: target.filePath,
              });
            }}
          />
        )}
      </main>
      </div>

      {toasts.length > 0 && (
        <div className="toasts" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.kind}`}>
              <span className="toast-dot" />
              <span className="msg">{t.text}</span>
              {t.action && (
                <button
                  type="button"
                  className="toast-action"
                  onClick={() => {
                    t.action?.onClick();
                    dismissToast(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
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
