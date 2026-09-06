import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { AuthUser } from "@flowforge/api-client";

import { useTheme } from "../ThemeProvider";
import { bootstrap, changePassword, getAuthStatus, login, me } from "../api/client";
import { setAuthToken, setServerUrl } from "../utils/storage";
import { ConnectScreen } from "./ConnectScreen";

type LoginScreenProps = {
  onAuthenticated: (user: AuthUser) => void;
  /** Optional: let the user change host after connect. */
  onChangeHost?: () => void;
  serverUrl: string;
};

export function LoginScreen({ onAuthenticated, onChangeHost, serverUrl }: LoginScreenProps) {
  const { colors } = useTheme();
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const status = await getAuthStatus();
        if (!cancelled) {
          setNeedsBootstrap(status.needs_bootstrap);
          setReady(true);
        }
      } catch {
        if (!cancelled) {
          setError("Could not reach the server auth endpoint.");
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [serverUrl]);

  async function handleSubmit() {
    const u = username.trim();
    if (!u || !password) {
      setError("Username and password are required.");
      return;
    }
    if (needsBootstrap) {
      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      if (password !== confirm) {
        setError("Passwords do not match.");
        return;
      }
    }

    setBusy(true);
    setError(null);
    try {
      const resp = needsBootstrap
        ? await bootstrap({ username: u, password, email: email.trim() || undefined })
        : await login({ username: u, password });
      await setAuthToken(resp.token);
      onAuthenticated(resp.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg, justifyContent: "center" }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: colors.text }]}>
          {needsBootstrap ? "Create admin account" : "Sign in"}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {needsBootstrap
            ? "This FlowForge server has no users yet. The first account becomes the admin."
            : `Connected to ${serverUrl}`}
        </Text>

        <Text style={[styles.label, { color: colors.textSecondary }]}>Username</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.line, color: colors.text }]}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
        />

        {needsBootstrap ? (
          <>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Email (optional)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.line, color: colors.text }]}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!busy}
            />
          </>
        ) : null}

        <Text style={[styles.label, { color: colors.textSecondary }]}>Password</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.line, color: colors.text }]}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!busy}
        />

        {needsBootstrap ? (
          <>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Confirm password</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.line, color: colors.text }]}
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              editable={!busy}
            />
          </>
        ) : null}

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        <Pressable
          style={[styles.button, { backgroundColor: colors.accent, opacity: busy ? 0.6 : 1 }]}
          onPress={() => void handleSubmit()}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={[styles.buttonText, { color: colors.onAccent }]}>
              {needsBootstrap ? "Create admin" : "Sign in"}
            </Text>
          )}
        </Pressable>

        {onChangeHost ? (
          <Pressable style={styles.linkBtn} onPress={onChangeHost} disabled={busy}>
            <Text style={[styles.linkText, { color: colors.textSecondary }]}>Change server address</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

type ForceChangeProps = {
  onDone: (user: AuthUser) => void;
};

function ForceChangePasswordScreen({ onDone }: ForceChangeProps) {
  const { colors } = useTheme();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      await setAuthToken(res.token);
      onDone(res.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: colors.text }]}>Set a new password</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Your account was seeded with a temporary password. Choose a permanent one before continuing.
        </Text>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Temporary password</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.line, color: colors.text }]}
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry
          editable={!busy}
        />
        <Text style={[styles.label, { color: colors.textSecondary }]}>New password</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.line, color: colors.text }]}
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          editable={!busy}
        />
        <Text style={[styles.label, { color: colors.textSecondary }]}>Confirm new password</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.line, color: colors.text }]}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          editable={!busy}
        />
        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
        <Pressable
          style={[styles.button, { backgroundColor: colors.accent, opacity: busy ? 0.6 : 1 }]}
          onPress={() => void handleSubmit()}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={[styles.buttonText, { color: colors.onAccent }]}>Save password</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

type AuthGateProps = {
  children: React.ReactNode;
};

/**
 * First launch: host URL → login/bootstrap → optional forced password change → app.
 */
export function AuthGate({ children }: AuthGateProps) {
  const { colors } = useTheme();
  const [phase, setPhase] = useState<"loading" | "connect" | "login" | "changepass" | "ready">("loading");
  const [serverUrl, setServerUrlState] = useState("");
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { getServerUrl, getAuthToken, setAuthToken: clearTok } = await import("../utils/storage");
      const url = await getServerUrl();
      if (!url) {
        if (!cancelled) setPhase("connect");
        return;
      }
      if (!cancelled) setServerUrlState(url);
      const token = await getAuthToken();
      if (!token) {
        if (!cancelled) setPhase("login");
        return;
      }
      try {
        await setServerUrl(url);
        const u = await me();
        if (!cancelled) {
          setUser(u);
          setPhase(u.must_change_password ? "changepass" : "ready");
        }
      } catch {
        await clearTok(null);
        if (!cancelled) setPhase("login");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (phase === "loading") {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  if (phase === "connect") {
    return (
      <ConnectScreen
        onConnected={() => {
          void (async () => {
            const { getServerUrl } = await import("../utils/storage");
            setServerUrlState(await getServerUrl());
            setPhase("login");
          })();
        }}
      />
    );
  }

  if (phase === "login") {
    return (
      <LoginScreen
        serverUrl={serverUrl}
        onAuthenticated={(u) => {
          setUser(u);
          setPhase(u.must_change_password ? "changepass" : "ready");
        }}
        onChangeHost={() => setPhase("connect")}
      />
    );
  }

  if (phase === "changepass") {
    return (
      <ForceChangePasswordScreen
        onDone={(u) => {
          setUser(u);
          setPhase("ready");
        }}
      />
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 24, gap: 8 },
  title: { fontSize: 26, fontWeight: "700" },
  subtitle: { fontSize: 14, marginBottom: 20, lineHeight: 20 },
  label: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.6, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginTop: 6,
  },
  error: { fontSize: 13, marginTop: 12, lineHeight: 18 },
  button: {
    marginTop: 20,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  buttonText: { fontSize: 15, fontWeight: "700" },
  linkBtn: { marginTop: 14, alignItems: "center", paddingVertical: 8 },
  linkText: { fontSize: 14 },
});
