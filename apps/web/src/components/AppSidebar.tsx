import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  availableResourceKinds,
  resourceKindLabel,
  type Mode,
  type ResourceKind,
  type SkillTool,
  type View,
} from "../nav";
import { projectBasename } from "../recent-projects";
import { toolLabel } from "../nav";

interface Props {
  open: boolean;
  view: View;
  currentMode: Mode | null;
  activeTool: SkillTool | null;
  root: string;
  recent: string[];
  onClose: () => void;
  onNavigate: (view: View) => void;
  onSelectMode: (mode: Mode) => void;
  onSelectProject: (path: string) => void;
  onSelectResource: (kind: ResourceKind) => void;
}

export function AppSidebar({
  open,
  view,
  currentMode,
  activeTool,
  root,
  recent,
  onClose,
  onNavigate,
  onSelectMode,
  onSelectProject,
  onSelectResource,
}: Props) {
  const sidebarRef = useRef<HTMLElement>(null);
  const [mobile, setMobile] = useState(() => window.matchMedia("(max-width: 900px)").matches);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 900px)");
    const update = () => setMobile(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;
    if (mobile && !open) sidebar.setAttribute("inert", "");
    else sidebar.removeAttribute("inert");
  }, [mobile, open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    if (mobile) document.body.style.overflow = "hidden";
    const sidebar = sidebarRef.current;
    sidebar?.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !sidebar) return;
      const focusable = [...sidebar.querySelectorAll<HTMLElement>("button:not(:disabled), select:not(:disabled)")];
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobile, open, onClose]);

  const projectPaths = [...new Set([root.trim(), ...recent].filter(Boolean))].slice(0, 5);
  const resourceKinds = activeTool ? availableResourceKinds(activeTool) : [];
  const contextTitle = currentMode === "global"
    ? "Global space"
    : currentMode === "project"
      ? root.trim()
        ? projectBasename(root)
        : "No project selected"
      : "Control center";
  const contextMeta = currentMode === "global"
    ? "User-level tool configuration"
    : currentMode === "project"
      ? root.trim() || "Choose a project to begin"
      : "Profiles, access and settings";

  return (
    <>
      <button
        type="button"
        className={`sidebar-backdrop ${open ? "open" : ""}`}
        aria-label="Close navigation"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
      />
      <aside
        ref={sidebarRef}
        className={`app-sidebar ${open ? "open" : ""}`}
        aria-label="Main navigation"
        role={open ? "dialog" : undefined}
        aria-modal={open || undefined}
        aria-hidden={mobile && !open ? true : undefined}
      >
        <div className={`sidebar-context ${currentMode ?? "neutral"}`}>
          <div className="sidebar-context-topline">
            <span>Current context</span>
            <span className="sidebar-live-dot" aria-hidden="true" />
          </div>
          <div className="sidebar-context-main">
            <span className="sidebar-context-glyph" aria-hidden="true">
              {currentMode === "global" ? "G" : currentMode === "project" ? "P" : "C"}
            </span>
            <span className="sidebar-context-copy">
              <strong>{contextTitle}</strong>
              <small title={contextMeta}>{contextMeta}</small>
            </span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <SidebarSection label="Workspace">
            <div className="sidebar-scope-switch">
              <SidebarButton
                active={currentMode === "global"}
                tone="global"
                icon="globe"
                label="Global"
                meta="User level"
                onClick={() => onSelectMode("global")}
              />
              <SidebarButton
                active={currentMode === "project" || view.screen === "project-gate"}
                tone="project"
                icon="folder"
                label="Project"
                meta={root.trim() ? projectBasename(root) : "Choose"}
                onClick={() => onSelectMode("project")}
              />
            </div>
            {projectPaths.length > 0 && (
              <div className="sidebar-projects" aria-label="Recent projects">
                <span className="sidebar-projects-label">Recent orbit</span>
                {projectPaths.map((path, index) => (
                  <button
                    key={path}
                    type="button"
                    className={root.trim() === path ? "active" : ""}
                    title={path}
                    onClick={() => onSelectProject(path)}
                  >
                    <span className="sidebar-project-index">{String(index + 1).padStart(2, "0")}</span>
                    <span className="sidebar-project-copy">
                      <strong>{projectBasename(path)}</strong>
                      <small>{path}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </SidebarSection>

          {currentMode && (
            <SidebarSection label="Manage">
              {activeTool && (
                <div className="sidebar-tool-context">
                  <span className="sidebar-tool-avatar">{toolLabel(activeTool).slice(0, 2).toUpperCase()}</span>
                  <span>
                    <small>Active tool</small>
                    <strong>{toolLabel(activeTool)}</strong>
                  </span>
                </div>
              )}
              <SidebarButton
                active={view.screen === "tools"}
                icon="tools"
                label="Tools"
                meta="Detected integrations"
                onClick={() => onNavigate({ screen: "tools", mode: currentMode })}
              />
              {activeTool && resourceKinds.map((kind) => (
                <SidebarButton
                  key={kind}
                  active={isActiveResource(view, kind)}
                  icon={kind}
                  label={resourceKindLabel(kind)}
                  onClick={() => onSelectResource(kind)}
                />
              ))}
            </SidebarSection>
          )}

          <SidebarSection label="System" system>
            <SidebarButton
              active={view.screen === "profile"}
              icon="database"
              label="Portable profile"
              meta="SQLite, export & import"
              onClick={() => onNavigate({ screen: "profile" })}
            />
            <SidebarButton
              active={view.screen === "security"}
              icon="shield"
              label="Login & security"
              meta="Local and VPS access"
              onClick={() => onNavigate({ screen: "security" })}
            />
          </SidebarSection>
        </nav>

        <footer className="sidebar-footer" aria-label={`coactl version ${__APP_VERSION__}`}>
          <span className="sidebar-footer-mark" aria-hidden="true">c</span>
          <span className="sidebar-footer-product">coactl</span>
          <span className="sidebar-footer-line" aria-hidden="true" />
          <span className="sidebar-footer-version">v{__APP_VERSION__}</span>
        </footer>
      </aside>
    </>
  );
}

function SidebarSection({ label, children, system = false }: { label: string; children: ReactNode; system?: boolean }) {
  return (
    <section className={`sidebar-section ${system ? "system" : ""}`}>
      <h2><span>{label}</span></h2>
      {children}
    </section>
  );
}

function SidebarButton({
  active,
  label,
  meta,
  tone,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  meta?: string;
  tone?: "global" | "project";
  icon: SidebarIconName;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`sidebar-link ${active ? "active" : ""} ${tone ?? ""}`}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
    >
      <span className="sidebar-link-icon" aria-hidden="true"><SidebarIcon name={icon} /></span>
      <span className="sidebar-link-copy">
        <strong>{label}</strong>
        {meta && <small>{meta}</small>}
      </span>
      <span className="sidebar-link-arrow" aria-hidden="true">↗</span>
    </button>
  );
}

type SidebarIconName = "globe" | "folder" | "tools" | "skills" | "rules" | "commands" | "workflows" | "database" | "shield";

function SidebarIcon({ name }: { name: SidebarIconName }) {
  const paths: Record<SidebarIconName, ReactNode> = {
    globe: <><circle cx="12" cy="12" r="8" /><path d="M4 12h16M12 4c2.2 2.2 3.2 4.9 3.2 8S14.2 17.8 12 20c-2.2-2.2-3.2-4.9-3.2-8S9.8 6.2 12 4z" /></>,
    folder: <path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h4l2 2h6a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 18 19H6a2.5 2.5 0 0 1-2.5-2.5v-9z" />,
    tools: <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="8" cy="6" r="1.5" /><circle cx="15" cy="12" r="1.5" /><circle cx="10" cy="18" r="1.5" /></>,
    skills: <><path d="M5 4.5h10a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3V4.5z" /><path d="M8 8h7M8 12h7M8 16h4" /></>,
    rules: <><path d="M7 4h10l3 3v13H7z" /><path d="M17 4v4h4M10 11h7M10 15h7" /></>,
    commands: <><path d="m5 7 4 5-4 5M11 17h8" /></>,
    workflows: <><circle cx="6" cy="6" r="2" /><circle cx="18" cy="12" r="2" /><circle cx="6" cy="18" r="2" /><path d="M8 6h3a4 4 0 0 1 4 4M8 18h3a4 4 0 0 0 4-4" /></>,
    database: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></>,
    shield: <><path d="M12 3.5 19 6v5c0 4.5-2.8 7.7-7 9.5C7.8 18.7 5 15.5 5 11V6z" /><path d="m9 12 2 2 4-5" /></>,
  };
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function isActiveResource(view: View, kind: ResourceKind): boolean {
  if (kind === "skills") return view.screen === "skills" || view.screen === "skill";
  if (kind === "rules") return view.screen === "rules" || view.screen === "rule";
  if (kind === "commands") return view.screen === "commands" || view.screen === "command";
  return view.screen === "workflows" || view.screen === "workflow";
}
