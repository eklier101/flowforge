/** Best-effort Habits notify on web (mobile uses native HabitsLink). */
export function notifyHabitsComplete(_source = "flowforge"): void {
  void fetch("/api/habits/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: _source }),
  }).catch(() => {});
}
