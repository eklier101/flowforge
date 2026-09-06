import { useState } from "react";
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

import { useTheme } from "../ThemeProvider";
import { getAppInfo } from "../api/client";
import { setServerUrl } from "../utils/storage";

type ConnectScreenProps = {
  /** Called once a server URL has been verified and stored. */
  onConnected: () => void;
  /** Shown when the user is re-pointing an already configured app. */
  initialUrl?: string;
  onCancel?: () => void;
};

function normalize(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  // Bare host or IP: assume plain http, which is the common self-hosted case.
  if (!/^https?:\/\//i.test(trimmed)) return `http://${trimmed}`;
  return trimmed;
}

export function ConnectScreen({ onConnected, initialUrl = "", onCancel }: ConnectScreenProps) {
  const { colors } = useTheme();
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnect() {
    const candidate = normalize(url);
    if (!candidate) {
      setError("Enter your FlowForge server address.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      // Store first so the shared API client picks the URL up, then verify.
      await setServerUrl(candidate);
      const info = await getAppInfo();
      if (!info) throw new Error("No response");
      setUrl(candidate);
      onConnected();
    } catch {
      setError(`Could not reach ${candidate}. Check the address and that the server is running.`);
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
        <Text style={[styles.title, { color: colors.text }]}>Connect to FlowForge</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          FlowForge is self-hosted, so point the app at your own server.
        </Text>

        <Text style={[styles.label, { color: colors.textSecondary }]}>Server address</Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: colors.inputBg, borderColor: colors.line, color: colors.text },
          ]}
          value={url}
          onChangeText={setUrl}
          placeholder="https://flowforge.example.com"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          onSubmitEditing={() => void handleConnect()}
          editable={!busy}
        />
        <Text style={[styles.hint, { color: colors.muted }]}>
          A public hostname or a local address with a port both work. FlowForge
          listens on port 8098 by default.
        </Text>

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        <Pressable
          style={[styles.button, { backgroundColor: colors.accent, opacity: busy ? 0.6 : 1 }]}
          onPress={() => void handleConnect()}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={[styles.buttonText, { color: colors.onAccent }]}>Connect</Text>
          )}
        </Pressable>

        {onCancel ? (
          <Pressable style={styles.linkBtn} onPress={onCancel} disabled={busy}>
            <Text style={[styles.linkText, { color: colors.textSecondary }]}>Cancel</Text>
          </Pressable>
        ) : null}

        <View style={styles.spacer} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 24, gap: 8 },
  title: { fontSize: 26, fontWeight: "700" },
  subtitle: { fontSize: 14, marginBottom: 20, lineHeight: 20 },
  label: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.6 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginTop: 6,
  },
  hint: { fontSize: 12, marginTop: 6 },
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
  spacer: { height: 40 },
});
