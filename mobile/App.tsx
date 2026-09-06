import { Component, type ErrorInfo, type ReactNode, useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { SidebarDrawer } from "./src/components/SidebarDrawer";
import { AuthGate } from "./src/screens/LoginScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { SettingsPane, SettingsScreen } from "./src/screens/SettingsScreen";
import { TaskListScreen } from "./src/screens/TaskListScreen";
import { maybeAutoDownloadOnWifi } from "./src/services/appUpdate";
import { notificationChannelSetup } from "./src/services/notifications";
import { ThemeProvider, useTheme } from "./src/ThemeProvider";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("FlowForge render crash", error, info);
  }

  override render() {
    if (this.state.error) {
      return (
        <View style={styles.errorRoot}>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorBody}>{this.state.error.message}</Text>
          <Pressable style={styles.errorBtn} onPress={() => this.setState({ error: null })}>
            <Text style={styles.errorBtnText}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

function MainApp() {
  const { resolvedTheme } = useTheme();

  const [activeView, setActiveView] = useState<"schedule" | "tasks" | "settings">("schedule");
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [settingsPane, setSettingsPane] = useState<SettingsPane>("general");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    notificationChannelSetup();
    void maybeAutoDownloadOnWifi().catch(() => {
      // ignore background update errors
    });
  }, []);

  function handleNavigate(
    view: "schedule" | "tasks" | "settings",
    listId?: number | null,
    pane?: string,
  ) {
    setActiveView(view);
    if (listId !== undefined) {
      setSelectedListId(listId);
    }
    if (pane) {
      setSettingsPane(pane as SettingsPane);
    }
  }

  return (
    <>
      <StatusBar style={resolvedTheme === "dark" ? "light" : "dark"} />

      {activeView === "schedule" && (
        <HomeScreen
          onOpenSidebar={() => setSidebarOpen(true)}
          onOpenSettings={() => {
            setSettingsPane("general");
            setActiveView("settings");
          }}
        />
      )}

      {activeView === "tasks" && (
        <TaskListScreen
          selectedListId={selectedListId}
          onSelectTaskList={setSelectedListId}
          onOpenSidebar={() => setSidebarOpen(true)}
          onOpenSettings={() => {
            setSettingsPane("general");
            setActiveView("settings");
          }}
        />
      )}

      {activeView === "settings" && (
        <SettingsScreen
          initialPane={settingsPane}
          onClose={() => setActiveView("schedule")}
        />
      )}

      <SidebarDrawer
        visible={sidebarOpen}
        activeView={activeView}
        selectedListId={selectedListId}
        onClose={() => setSidebarOpen(false)}
        onNavigate={handleNavigate}
        onOpenAddAccount={() => {
          setSettingsPane("calendars");
          setActiveView("settings");
        }}
        onOpenAddList={() => {
          setSettingsPane("lists");
          setActiveView("settings");
        }}
      />
    </>
  );
}

/**
 * AuthGate asks for host URL (if needed) then login before the main app.
 */
export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ErrorBoundary>
            <AuthGate>
              <MainApp />
            </AuthGate>
          </ErrorBoundary>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  errorRoot: {
    flex: 1,
    backgroundColor: "#12110F",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  errorTitle: { color: "#fff", fontSize: 20, fontWeight: "700" },
  errorBody: { color: "#a1a1aa", textAlign: "center" },
  errorBtn: {
    marginTop: 8,
    backgroundColor: "#3b82f6",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  errorBtnText: { color: "#fff", fontWeight: "600" },
});
