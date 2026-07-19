import { useState, type FormEvent } from "react";
import { api, type AuthStatus } from "../api";
import { ThemeToggle, type Theme } from "../components/ThemeToggle";

interface Props {
  onLoggedIn: (status: AuthStatus) => void;
  theme: Theme;
  onToggleTheme: () => void;
}

export function UnlockView({ onLoggedIn, theme, onToggleTheme }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const status = await api.login(password);
      onLoggedIn(status);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app unlock-app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">c</span>
          <span>
            coa<em>ctl</em>
          </span>
        </div>
        <div className="topbar-spacer" />
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </header>
      <main className="content unlock-content">
        <form className="unlock-card" onSubmit={(e) => void submit(e)}>
          <h1>Log in to coactl</h1>
          <p className="panel-sub">
            Login is enabled on this instance. Enter the password to manage skills and rules.
          </p>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="primary" type="submit" disabled={busy || !password}>
            Log in
          </button>
        </form>
      </main>
    </div>
  );
}
