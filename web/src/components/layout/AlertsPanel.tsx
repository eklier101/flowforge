import type { DeadlineTaskAlert } from "@flowforge/api-client";

import { useAppContext } from "../../context/AppContext";
import { Icon } from "../icons/IconSprite";

type AlertsPanelProps = {
  alerts: DeadlineTaskAlert[];
  onClose: () => void;
};

export function AlertsPanel({ alerts, onClose }: AlertsPanelProps) {
  const { tasks, openEditTask, navigateToView, closeComposer } = useAppContext();

  const visibleAlerts = alerts.filter((alert) => {
    const task = tasks.find((t) => t.id === alert.task_id);
    return !task || !task.is_completed;
  });

  return (
    <div className="alerts-panel" onClick={(e) => e.stopPropagation()}>
      <div className="alerts-panel-head">
        <strong>Deadline alerts</strong>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          <Icon name="x" />
        </button>
      </div>
      {visibleAlerts.length === 0 ? (
        <p className="alerts-panel-empty">No deadline alerts right now.</p>
      ) : (
        <ul className="alerts-panel-list">
          {visibleAlerts.map((alert) => {
            const task = tasks.find((t) => t.id === alert.task_id);
            return (
              <li key={alert.task_id} className={`alerts-panel-item ${alert.status}`}>
                <span className="alerts-panel-label">{alert.label}</span>
                <span className="alerts-panel-title">{alert.title || task?.title || `Task #${alert.task_id}`}</span>
                <div className="alerts-panel-actions">
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => {
                      if (task) {
                        closeComposer();
                        openEditTask(task);
                      }
                      onClose();
                    }}
                  >
                    Open task
                  </button>
                  {task?.list_id != null && (
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => {
                        void navigateToView(`list-${task.list_id!}`);
                        onClose();
                      }}
                    >
                      See in list
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
