import { useState, type FormEvent } from "react";
import type { AuthUser } from "@flowforge/api-client";

import { api, setAuthToken } from "../../api";

type Props = {
  onDone: (user: AuthUser) => void;
};

/** Shown when the seeded admin must replace a temporary password. */
export function ForceChangePassword({ onDone }: Props) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setAuthToken(res.token);
      onDone(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change password.");
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
        }}
      >
        <h1 style={{ margin: "0 0 8px", fontSize: 22 }}>Set a new password</h1>
        <p style={{ margin: "0 0 20px", color: "var(--muted)", fontSize: 14, lineHeight: 1.45 }}>
          Your account was seeded with a temporary password. Choose a permanent one before continuing.
        </p>
        <label style={{ display: "block", fontSize: 12, marginBottom: 6, color: "var(--muted)" }}>
          Temporary password
        </label>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
          style={{ width: "100%", marginBottom: 12, padding: "10px 12px" }}
        />
        <label style={{ display: "block", fontSize: 12, marginBottom: 6, color: "var(--muted)" }}>
          New password
        </label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={8}
          style={{ width: "100%", marginBottom: 12, padding: "10px 12px" }}
        />
        <label style={{ display: "block", fontSize: 12, marginBottom: 6, color: "var(--muted)" }}>
          Confirm new password
        </label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
          style={{ width: "100%", marginBottom: 16, padding: "10px 12px" }}
        />
        {error ? (
          <p style={{ color: "var(--danger, #e11)", fontSize: 13, marginBottom: 12 }}>{error}</p>
        ) : null}
        <button className="btn-accent" type="submit" disabled={busy} style={{ width: "100%" }}>
          {busy ? "Saving…" : "Save password"}
        </button>
      </form>
    </div>
  );
}
