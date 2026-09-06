import { useState, type FormEvent } from "react";
import type { AuthUser } from "@flowforge/api-client";

import { api, setAuthToken } from "../../api";

type Props = {
  needsBootstrap: boolean;
  onAuthenticated: (user: AuthUser) => void;
};

export function LoginScreen({ needsBootstrap, onAuthenticated }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (needsBootstrap) {
      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
    }
    setBusy(true);
    try {
      const res = needsBootstrap
        ? await api.bootstrap({
            username: username.trim(),
            password,
            ...(email.trim() ? { email: email.trim() } : {}),
          })
        : await api.login({ username: username.trim(), password });
      setAuthToken(res.token);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "var(--bg)",
        color: "var(--text)",
      }}
    >
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="card"
        style={{
          width: "min(400px, 100%)",
          padding: 28,
          background: "var(--panel)",
          border: "1px solid var(--line)",
          borderRadius: 12,
          boxShadow: "var(--shadow)",
        }}
      >
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "var(--accent)",
              color: "var(--on-accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 18,
              marginBottom: 14,
            }}
          >
            F
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>FlowForge</h1>
          <p className="hint" style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 13.5 }}>
            {needsBootstrap ? "Create the first admin account to get started." : "Sign in to continue."}
          </p>
        </div>

        <div className="stack" style={{ gap: 12 }}>
          <label className="field">
            <span>Username</span>
            <input
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={busy}
            />
          </label>

          {needsBootstrap && (
            <label className="field">
              <span>Email (optional)</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
                placeholder="admin@example.com"
              />
            </label>
          )}

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete={needsBootstrap ? "new-password" : "current-password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </label>

          {needsBootstrap && (
            <label className="field">
              <span>Confirm password</span>
              <input
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={busy}
              />
            </label>
          )}

          {error && <p className="form-error">{error}</p>}

          <button className="btn-accent" type="submit" disabled={busy} style={{ width: "100%", marginTop: 4 }}>
            {busy ? "Please wait…" : needsBootstrap ? "Create admin account" : "Sign in"}
          </button>
        </div>
      </form>
    </div>
  );
}
