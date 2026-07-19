import { useState } from "react";
import { api, type AuthStatus } from "../api";

interface Props {
  auth: AuthStatus;
  onAuthChange: (status: AuthStatus) => void;
  onToast: (kind: "success" | "error", text: string) => void;
}

export function AuthSettingsPanel({ auth, onAuthChange, onToast }: Props) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [current, setCurrent] = useState("");
  const [busy, setBusy] = useState(false);

  async function enable() {
    setBusy(true);
    try {
      const status = await api.enableAuth(password, confirm);
      onAuthChange(status);
      setPassword("");
      setConfirm("");
      onToast("success", `Login enabled — password hash saved to ${status.authFilePath}`);
    } catch (err) {
      onToast("error", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const status = await api.disableAuth(current);
      onAuthChange(status);
      setCurrent("");
      setPassword("");
      setConfirm("");
      onToast("success", "Login disabled");
    } catch (err) {
      onToast("error", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function change() {
    setBusy(true);
    try {
      const status = await api.changeAuthPassword(current, password, confirm);
      onAuthChange(status);
      setCurrent("");
      setPassword("");
      setConfirm("");
      onToast("success", "Password updated (other sessions signed out)");
    } catch (err) {
      onToast("error", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-settings">
      <div className="auth-settings-head">
        <h2>Login (optional)</h2>
        <span className={`badge ${auth.enabled ? "warn" : "clean"}`}>
          {auth.enabled ? "enabled" : "off"}
        </span>
      </div>
      <p className="panel-sub">
        For VPS / remote access. Password is never stored in plaintext — a one-way scrypt hash is
        written to <code>{auth.authFilePath}</code> (mode 600). No <code>.env</code> required.
      </p>

      {!auth.enabled ? (
        <div className="auth-form">
          <label className="field">
            <span>New password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="field">
            <span>Confirm</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={busy}
            />
          </label>
          <button
            className="primary"
            type="button"
            disabled={busy || password.length < 8 || password !== confirm}
            onClick={() => void enable()}
          >
            Enable login
          </button>
        </div>
      ) : (
        <div className="auth-form">
          <label className="field">
            <span>Current password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="field">
            <span>New password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="field">
            <span>Confirm new</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={busy}
            />
          </label>
          <div className="actions">
            <button
              className="primary"
              type="button"
              disabled={busy || !current || password.length < 8 || password !== confirm}
              onClick={() => void change()}
            >
              Change password
            </button>
            <button type="button" disabled={busy || !current} onClick={() => void disable()}>
              Disable login
            </button>
          </div>
          <p className="muted" style={{ fontSize: "0.8rem", margin: 0 }}>
            Disable confirms with the current password field above.
          </p>
        </div>
      )}
    </section>
  );
}
