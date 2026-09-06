import { useEffect, useState } from "react";

import { api } from "../../api";
import type { DeadlineTaskAlert } from "@flowforge/api-client";
import { Icon } from "../icons/IconSprite";
import { DeadlineTooltip } from "./DeadlineTooltip";

type DeadlineStatus = "on_track" | "close" | "will_miss" | "overdue";

type DeadlineStatusPillProps = {
  taskId: number | null;
  dueDate: string;
  durationMinutes: number;
  autoSchedule: boolean;
  workloadDistribution: string;
  preview?: boolean;
  onClick?: (anchor: HTMLElement) => void;
};

export function DeadlineStatusPill({
  taskId,
  dueDate,
  durationMinutes,
  autoSchedule,
  workloadDistribution,
  preview = false,
  onClick,
}: DeadlineStatusPillProps) {
  const [status, setStatus] = useState<DeadlineStatus>("on_track");
  const [label, setLabel] = useState("On track");
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    if (!autoSchedule || !dueDate) {
      setStatus("on_track");
      setLabel("On track");
      return;
    }
    let cancelled = false;
    void (async () => {
      if (taskId && !preview) {
        try {
          const alerts = await api.getDeadlineAlerts();
          const match = alerts.tasks.find((t: DeadlineTaskAlert) => t.task_id === taskId);
          if (match && !cancelled) {
            setStatus(match.status as DeadlineStatus);
            setLabel(match.label);
            return;
          }
        } catch {
          /* preview fallback */
        }
      }
      if (!cancelled) {
        setStatus("on_track");
        setLabel("On track");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [taskId, dueDate, durationMinutes, autoSchedule, preview]);

  if (!autoSchedule) return null;

  const pillClass =
    status === "will_miss" || status === "overdue"
      ? "deadline-pill miss"
      : status === "close"
        ? "deadline-pill close"
        : "deadline-pill track";

  return (
    <div className="deadline-pill-wrap">
      <button
        type="button"
        className={pillClass}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={(e) => {
          setShowTooltip((s) => !s);
          onClick?.(e.currentTarget);
        }}
      >
        <Icon name="flag" style={{ width: 11, height: 11 }} />
        <span>{label}</span>
      </button>
      {showTooltip && (
        <DeadlineTooltip status={status} workloadDistribution={workloadDistribution} onClose={() => setShowTooltip(false)} />
      )}
    </div>
  );
}
