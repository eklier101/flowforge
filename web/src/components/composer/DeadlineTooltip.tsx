type DeadlineTooltipProps = {
  status: "on_track" | "close" | "will_miss" | "overdue";
  workloadDistribution: string;
  onClose: () => void;
};

const MESSAGES: Record<string, string> = {
  on_track: "Your task is scheduled to finish before the due date with room to spare.",
  close: "Your task is scheduled to finish close to the due date. Consider adjusting workload distribution.",
  will_miss: "Your task is scheduled to finish after the due date. Try recalculating or adjusting duration.",
  overdue: "This task's deadline has already passed and it is still open. Reschedule it or move the due date.",
};

export function DeadlineTooltip({ status, workloadDistribution, onClose }: DeadlineTooltipProps) {
  const seg = status === "will_miss" || status === "overdue" ? 2 : status === "close" ? 1 : 0;
  return (
    <div className="deadline-tooltip" onClick={(e) => e.stopPropagation()}>
      <div className="deadline-tooltip-bar">
        <span className={seg === 0 ? "on" : ""} />
        <span className={seg === 1 ? "on" : ""} />
        <span className={seg === 2 ? "on" : ""} />
      </div>
      <p>{MESSAGES[status]}</p>
      <p className="deadline-tooltip-sub">Workload: {workloadDistribution || "Close to deadline"}</p>
      <button type="button" className="deadline-tooltip-close" onClick={onClose}>×</button>
    </div>
  );
}
