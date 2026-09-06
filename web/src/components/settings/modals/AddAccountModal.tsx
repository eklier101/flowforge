import { useEffect, useState } from "react";

import { api, getAuthToken } from "../../../api";
import { useAppContext } from "../../../context/AppContext";
import { CAL_COLORS } from "../../../lib/constants";
import { Icon } from "../../icons/IconSprite";

type View = "choices" | "ical" | "internal";

function startGoogleAuth() {
  window.location.href = api.googleAuthStartUrl("", getAuthToken());
}

export function AddAccountModal() {
  const {
    addAccountOpen,
    closeAddAccountModal,
    googleStatus,
    toast,
    loadCalendars,
    loadGoogleData,
    syncAfterMutation,
  } = useAppContext();

  const [view, setView] = useState<View>("choices");
  const [icalName, setIcalName] = useState("");
  const [icalUrl, setIcalUrl] = useState("");
  const [internalName, setInternalName] = useState("");
  const [selectedColor, setSelectedColor] = useState(CAL_COLORS[0]);
  const [icalError, setIcalError] = useState("");
  const [internalError, setInternalError] = useState("");

  useEffect(() => {
    if (!addAccountOpen) return;
    setView("choices");
    setIcalName("");
    setIcalUrl("");
    setInternalName("");
    setSelectedColor(CAL_COLORS[0]);
    setIcalError("");
    setInternalError("");
  }, [addAccountOpen]);

  if (!addAccountOpen) return null;

  const title =
    view === "ical" ? "Add iCal feed" : view === "internal" ? "New FlowForge calendar" : "Add calendar account";

  async function submitIcal(e: React.FormEvent) {
    e.preventDefault();
    setIcalError("");
    try {
      await api.createCalendar({
        name: icalName.trim(),
        url: icalUrl.trim(),
        provider: "ical",
        is_active: true,
      });
      closeAddAccountModal();
      await loadCalendars();
      await syncAfterMutation();
      toast("iCal feed added", "ok");
    } catch (err) {
      setIcalError(err instanceof Error ? err.message : "Failed to add feed");
    }
  }

  async function submitInternal(e: React.FormEvent) {
    e.preventDefault();
    setInternalError("");
    try {
      await api.createCalendar({
        name: internalName.trim(),
        provider: "internal",
        color: selectedColor,
        is_active: true,
      });
      closeAddAccountModal();
      await loadCalendars();
      await syncAfterMutation();
      toast("Calendar created", "ok");
    } catch (err) {
      setInternalError(err instanceof Error ? err.message : "Failed to create calendar");
    }
  }

  return (
    <div
      className={`backdrop open`}
      id="add-account-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeAddAccountModal();
      }}
    >
      <div className="card" style={{ width: "min(440px, 100%)" }}>
        <div className="card-head">
          <h3 style={{ margin: 0, fontSize: 16 }} id="add-account-title">{title}</h3>
          <span className="spacer" style={{ flex: 1 }} />
          <button className="icon-btn" type="button" id="add-account-close" title="Close" onClick={closeAddAccountModal}>
            <Icon name="x" />
          </button>
        </div>

        {view === "choices" && (
          <div id="add-account-choices" className="stack" style={{ gap: 8, marginTop: 8 }}>
            {googleStatus?.configured && (
              <div
                className="account-choice-row"
                id="choice-google"
                role="button"
                tabIndex={0}
                onClick={() => startGoogleAuth()}
                onKeyDown={(e) => e.key === "Enter" && startGoogleAuth()}
              >
                <div className="choice-icon" style={{ background: "#ffffff" }}>
                  <svg viewBox="0 0 24 24" style={{ width: 20, height: 20 }}>
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                </div>
                <div className="body" style={{ flex: 1 }}>
                  <strong style={{ fontSize: 13.5 }}>Google Calendar</strong>
                  <div className="rm">Connect your Google account and calendars via OAuth</div>
                </div>
                <Icon name="chev-right" style={{ color: "var(--faint)" }} />
              </div>
            )}

            <div
              className="account-choice-row"
              id="choice-ical"
              role="button"
              tabIndex={0}
              onClick={() => setView("ical")}
              onKeyDown={(e) => e.key === "Enter" && setView("ical")}
            >
              <div className="choice-icon" style={{ background: "var(--elev)", color: "var(--accent)" }}>
                <Icon name="calendar" style={{ width: 20, height: 20 }} />
              </div>
              <div className="body" style={{ flex: 1 }}>
                <strong style={{ fontSize: 13.5 }}>iCal Feed URL</strong>
                <div className="rm">Subscribe to any webcal / iCal (.ics) subscription link</div>
              </div>
              <Icon name="chev-right" style={{ color: "var(--faint)" }} />
            </div>

            <div
              className="account-choice-row"
              id="choice-internal"
              role="button"
              tabIndex={0}
              onClick={() => setView("internal")}
              onKeyDown={(e) => e.key === "Enter" && setView("internal")}
            >
              <div className="choice-icon" style={{ background: "var(--accent)", color: "#ffffff" }}>
                <span style={{ fontWeight: 800, fontSize: 13 }}>F</span>
              </div>
              <div className="body" style={{ flex: 1 }}>
                <strong style={{ fontSize: 13.5 }}>FlowForge Calendar</strong>
                <div className="rm">Add an internal calendar category (e.g. Work, School, Family)</div>
              </div>
              <Icon name="chev-right" style={{ color: "var(--faint)" }} />
            </div>
          </div>
        )}

        {view === "ical" && (
          <form id="add-ical-form" className="stack" style={{ gap: 10, marginTop: 10 }} onSubmit={submitIcal}>
            <label className="field">
              <span>Name</span>
              <input id="new-ical-name" placeholder="Work Calendar" required value={icalName} onChange={(e) => setIcalName(e.target.value)} />
            </label>
            <label className="field">
              <span>iCal URL</span>
              <input id="new-ical-url" placeholder="https://..." required value={icalUrl} onChange={(e) => setIcalUrl(e.target.value)} />
            </label>
            {icalError && <p className="form-error" id="ical-error">{icalError}</p>}
            <div className="card-actions">
              <button className="btn-quiet" type="button" id="ical-cancel" onClick={() => setView("choices")}>Back</button>
              <button className="btn-accent" type="submit">Add iCal Feed</button>
            </div>
          </form>
        )}

        {view === "internal" && (
          <form id="add-internal-form" className="stack" style={{ gap: 10, marginTop: 10 }} onSubmit={submitInternal}>
            <label className="field">
              <span>Calendar Name</span>
              <input id="new-internal-name" placeholder="Work / Personal" required value={internalName} onChange={(e) => setInternalName(e.target.value)} />
            </label>
            <div className="field">
              <span>Color</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }} id="color-picker-chips">
                {CAL_COLORS.map((c) => (
                  <div
                    key={c}
                    className={`color-chip-btn ${c === selectedColor ? "selected" : ""}`}
                    data-color={c}
                    style={{ background: c }}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedColor(c)}
                    onKeyDown={(e) => e.key === "Enter" && setSelectedColor(c)}
                  />
                ))}
              </div>
            </div>
            {internalError && <p className="form-error" id="internal-error">{internalError}</p>}
            <div className="card-actions">
              <button className="btn-quiet" type="button" id="internal-cancel" onClick={() => setView("choices")}>Back</button>
              <button className="btn-accent" type="submit">Create Calendar</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
