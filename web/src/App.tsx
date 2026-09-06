import { useCallback, useEffect, useState } from "react";
import type { AuthUser } from "@flowforge/api-client";

import { api, getAuthToken, setAuthToken } from "./api";
import { LoginScreen } from "./components/auth/LoginScreen";
import { ForceChangePassword } from "./components/auth/ForceChangePassword";
import { ComposerModal } from "./components/composer/ComposerModal";
import { KeyboardHelpModal } from "./components/layout/KeyboardHelpModal";
import { Sidebar } from "./components/layout/Sidebar";
import { Toast } from "./components/layout/Toast";
import { Topbar } from "./components/layout/Topbar";
import { CalendarView } from "./components/schedule/CalendarView";
import { SettingsModal } from "./components/settings/SettingsModal";
import { BulkImportModal } from "./components/settings/modals/BulkImportModal";
import { EditListModal } from "./components/settings/modals/EditListModal";
import { TaskListView } from "./components/tasks/TaskListView";
import { AppProvider, useAppContext } from "./context/AppContext";
import { AuthProvider } from "./context/AuthContext";
import { useSchedule } from "./hooks/useSchedule";
import { THEME_KEY } from "./lib/constants";

function AppShell() {
  const {
    view,
    collapsed,
    openComposer,
    closeComposer,
    composerOpen,
    settingsOpen,
    closeSettings,
    toast,
    editingList,
    closeEditListModal,
    registerRefreshSchedule,
  } = useAppContext();
  const schedule = useSchedule();
  const [keyboardHelpOpen, setKeyboardHelpOpen] = useState(false);
  const [composerHasPopover, setComposerHasPopover] = useState(false);

  useEffect(() => {
    registerRefreshSchedule(schedule.refreshScheduleData);
  }, [registerRefreshSchedule, schedule.refreshScheduleData]);

  const onRecalculate = useCallback(async () => {
    try {
      const n = await schedule.recalculate(true);
      toast(`Scheduled ${n} block${n === 1 ? "" : "s"}`, "ok");
    } catch {
      /* error toast handled in recalculate */
    }
  }, [schedule, toast]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (composerHasPopover) {
          window.dispatchEvent(new CustomEvent("flowforge:close-popovers"));
          return;
        }
        if (composerOpen) {
          closeComposer();
        } else if (settingsOpen) {
          closeSettings();
        } else if (keyboardHelpOpen) {
          setKeyboardHelpOpen(false);
        }
        return;
      }
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName ?? "");
      if (typing || event.metaKey || event.ctrlKey) return;
      if (event.key === "n") {
        event.preventDefault();
        openComposer("task");
      } else if (event.key === "t") {
        schedule.goToday();
      } else if (event.key === "ArrowRight") {
        schedule.shiftRange(1);
      } else if (event.key === "ArrowLeft") {
        schedule.shiftRange(-1);
      } else if (event.key === "?") {
        setKeyboardHelpOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openComposer, closeComposer, composerOpen, settingsOpen, closeSettings, schedule, keyboardHelpOpen, composerHasPopover]);

  return (
    <div className={`app${collapsed ? " collapsed" : ""}`} id="app">
      <Sidebar />
      <main className="main">
        <Topbar
          onRecalculate={() => void onRecalculate()}
          recalcBusy={schedule.busy}
          onRangeChange={schedule.setRange}
          onPrev={() => schedule.shiftRange(-1)}
          onNext={() => schedule.shiftRange(1)}
          onFarPrev={() => schedule.jumpWeeks(-1)}
          onFarNext={() => schedule.jumpWeeks(1)}
          onToday={schedule.goToday}
        />
        <Toast />
        {view === "schedule" ? (
          <CalendarView
            days={schedule.days}
            dayKeys={schedule.dayKeys}
            scrolled={schedule.scrolled}
            setScrolled={schedule.setScrolled}
            isDragging={schedule.isDragging}
            setIsDragging={schedule.setIsDragging}
            onScheduleChange={schedule.refreshScheduleData}
          />
        ) : (
          <TaskListView />
        )}
      </main>
      <ComposerModal onPopoverChange={setComposerHasPopover} />
      <SettingsModal />
      <BulkImportModal />
      <KeyboardHelpModal open={keyboardHelpOpen} onClose={() => setKeyboardHelpOpen(false)} />
      <EditListModal list={editingList === undefined ? null : editingList} open={editingList !== undefined} onClose={closeEditListModal} />
    </div>
  );
}

function AuthGate() {
  const [booting, setBooting] = useState(true);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const status = await api.getAuthStatus();
        if (cancelled) return;
        setNeedsBootstrap(status.needs_bootstrap);
        const token = getAuthToken();
        if (!token || status.needs_bootstrap) {
          setUser(null);
          return;
        }
        try {
          const me = await api.me();
          if (!cancelled) setUser(me);
        } catch {
          setAuthToken(null);
          if (!cancelled) setUser(null);
        }
      } catch {
        if (!cancelled) {
          setNeedsBootstrap(false);
          setUser(null);
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (booting) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg)",
          color: "var(--muted)",
        }}
      >
        Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <LoginScreen
        needsBootstrap={needsBootstrap}
        onAuthenticated={(u) => {
          setNeedsBootstrap(false);
          setUser(u);
        }}
      />
    );
  }

  if (user.must_change_password) {
    return <ForceChangePassword onDone={setUser} />;
  }

  return (
    <AuthProvider user={user}>
      <AppProvider>
        <AppShell />
      </AppProvider>
    </AuthProvider>
  );
}

export function App() {
  return <AuthGate />;
}

(function initTheme() {
  const stored = localStorage.getItem(THEME_KEY) || "dark";
  const resolved =
    stored === "system"
      ? window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark"
      : stored;
  document.documentElement.dataset.theme = resolved;
})();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
