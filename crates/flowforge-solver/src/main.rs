//! FlowForge scheduling placement engine.
//! Reads a JSON request from stdin, writes placements JSON to stdout.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{self, Read, Write};

#[derive(Debug, Clone, Deserialize, Serialize)]
struct Interval {
    start: String,
    end: String,
}

#[derive(Debug, Clone, Deserialize)]
struct TaskInput {
    id: i64,
    duration_minutes: i32,
    due_date: String,
    allow_splitting: bool,
    min_split_minutes: i32,
    buffer_before_minutes: i32,
    buffer_minutes: i32,
    start_after: Option<String>,
    depends_on_task_id: Option<i64>,
    auto_ignore: bool,
    workload_mode: String,
    preset_name: String,
    locked_minutes: i32,
}

#[derive(Debug, Deserialize)]
struct Request {
    buffer_days: i32,
    #[allow(dead_code)]
    global_workload_mode: String,
    completed_task_ids: Vec<i64>,
    external_busy: Vec<Interval>,
    available_by_preset: HashMap<String, Vec<Interval>>,
    tasks: Vec<TaskInput>,
}

#[derive(Debug, Serialize)]
struct Placement {
    task_id: i64,
    start: String,
    end: String,
}

#[derive(Debug, Serialize)]
struct Response {
    placements: Vec<Placement>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

fn parse_ts(s: &str) -> Option<i64> {
    // RFC3339 → unix seconds via chrono-less parse: use time crate? keep deps minimal —
    // Accept RFC3339 with chrono via manual: use `chrono` would add dep.
    // Use `time` crate... simplest: add `chrono` with clock feature off.
    chrono::DateTime::parse_from_rfc3339(s)
        .ok()
        .map(|dt| dt.timestamp())
}

fn fmt_ts(secs: i64) -> String {
    use chrono::{TimeZone, Utc};
    Utc.timestamp_opt(secs, 0)
        .single()
        .map(|dt| dt.to_rfc3339_opts(chrono::SecondsFormat::Secs, true))
        .unwrap_or_else(|| format!("{secs}"))
}

#[derive(Clone, Copy)]
struct Iv {
    start: i64,
    end: i64,
}

fn iv_minutes(iv: Iv) -> i32 {
    ((iv.end - iv.start) / 60) as i32
}

fn merge_intervals(mut intervals: Vec<Iv>) -> Vec<Iv> {
    if intervals.is_empty() {
        return intervals;
    }
    intervals.sort_by_key(|i| i.start);
    let mut out = Vec::with_capacity(intervals.len());
    let mut cur = intervals[0];
    for iv in intervals.into_iter().skip(1) {
        if iv.start <= cur.end {
            if iv.end > cur.end {
                cur.end = iv.end;
            }
        } else {
            out.push(cur);
            cur = iv;
        }
    }
    out.push(cur);
    out
}

fn subtract_busy(windows: &[Iv], busy: &[Iv]) -> Vec<Iv> {
    let busy = merge_intervals(busy.to_vec());
    let mut result = Vec::new();
    for &w in windows {
        let mut parts = vec![w];
        for b in &busy {
            let mut next = Vec::new();
            for p in parts {
                if b.end <= p.start || b.start >= p.end {
                    next.push(p);
                    continue;
                }
                if b.start > p.start {
                    next.push(Iv {
                        start: p.start,
                        end: b.start,
                    });
                }
                if b.end < p.end {
                    next.push(Iv {
                        start: b.end,
                        end: p.end,
                    });
                }
            }
            parts = next;
        }
        result.extend(parts);
    }
    merge_intervals(result)
}

fn subtract_interval(available: &[Iv], cut_start: i64, cut_end: i64) -> Vec<Iv> {
    subtract_busy(available, &[Iv {
        start: cut_start,
        end: cut_end,
    }])
}

fn trim_before_due(available: &[Iv], due: i64) -> Vec<Iv> {
    let mut out = Vec::new();
    for &iv in available {
        if iv.start >= due {
            continue;
        }
        let end = iv.end.min(due);
        if end > iv.start {
            out.push(Iv {
                start: iv.start,
                end,
            });
        }
    }
    out
}

fn trim_after(available: &[Iv], after: i64) -> Vec<Iv> {
    let mut out = Vec::new();
    for &iv in available {
        if iv.end > after {
            let start = iv.start.max(after);
            out.push(Iv {
                start,
                end: iv.end,
            });
        }
    }
    out
}

fn pick_slot_index(slots: &[Iv], minutes_needed: i32, mode: &str, due: i64, buffer_days: i32) -> Option<usize> {
    let candidates: Vec<usize> = slots
        .iter()
        .enumerate()
        .filter(|(_, s)| iv_minutes(**s) >= minutes_needed)
        .map(|(i, _)| i)
        .collect();
    if candidates.is_empty() {
        return None;
    }
    match mode {
        "Front-load" => Some(candidates[0]),
        "Close to deadline" => {
            let buffer_start = due - (buffer_days as i64) * 86400;
            let mut best: Option<usize> = None;
            for &i in &candidates {
                let slot = slots[i];
                if slot.end > due || slot.start < buffer_start {
                    continue;
                }
                if best.map(|b| slot.start > slots[b].start).unwrap_or(true) {
                    best = Some(i);
                }
            }
            if best.is_some() {
                return best;
            }
            for &i in &candidates {
                let slot = slots[i];
                if slot.end > due {
                    continue;
                }
                if best.map(|b| slot.start > slots[b].start).unwrap_or(true) {
                    best = Some(i);
                }
            }
            best.or_else(|| candidates.last().copied())
        }
        _ => Some(candidates[candidates.len() / 2]),
    }
}

fn place_chunk(available: &[Iv], slot: Iv, work_minutes: i32, buf_before: i32, buf_after: i32) -> (Iv, Vec<Iv>) {
    let work_start = slot.start + (buf_before as i64) * 60;
    let work_end = work_start + (work_minutes as i64) * 60;
    let consumed_end = work_end + (buf_after as i64) * 60;
    let updated = subtract_interval(available, slot.start, consumed_end);
    (
        Iv {
            start: work_start,
            end: work_end,
        },
        updated,
    )
}

fn schedule_task(
    mut available: Vec<Iv>,
    duration: i32,
    allow_split: bool,
    min_split: i32,
    buf_before: i32,
    buf_after: i32,
    mode: &str,
    due: i64,
    buffer_days: i32,
) -> (Vec<Iv>, Vec<Iv>) {
    let mut remaining = duration;
    let mut placements = Vec::new();
    let min_chunk = if allow_split {
        min_split.max(1)
    } else {
        duration
    };

    while remaining > 0 {
        let need = if allow_split {
            remaining.min(remaining.max(min_chunk)).max(min_chunk).min(remaining)
        } else {
            remaining
        };
        // Prefer contiguous chunk of `need` including buffers.
        let total_need = need + buf_before + buf_after;
        let Some(idx) = pick_slot_index(&available, total_need, mode, due, buffer_days) else {
            break;
        };
        let slot = available[idx];
        let chunk_mins = if allow_split {
            let max_fit = iv_minutes(slot) - buf_before - buf_after;
            if max_fit < min_chunk {
                break;
            }
            remaining.min(max_fit)
        } else {
            need
        };
        let (placed, next_avail) = place_chunk(&available, slot, chunk_mins, buf_before, buf_after);
        available = next_avail;
        placements.push(placed);
        remaining -= chunk_mins;
        if !allow_split {
            break;
        }
    }
    (available, placements)
}

fn to_iv(list: &[Interval]) -> Vec<Iv> {
    list.iter()
        .filter_map(|i| {
            let s = parse_ts(&i.start)?;
            let e = parse_ts(&i.end)?;
            if e > s {
                Some(Iv { start: s, end: e })
            } else {
                None
            }
        })
        .collect()
}

fn place(req: Request) -> Result<Vec<Placement>, String> {
    let completed: HashMap<i64, bool> = req.completed_task_ids.iter().map(|id| (*id, true)).collect();
    let external_busy = merge_intervals(to_iv(&req.external_busy));

    let mut available_by_preset: HashMap<String, Vec<Iv>> = HashMap::new();
    for (k, v) in &req.available_by_preset {
        available_by_preset.insert(k.clone(), to_iv(v));
    }

    let mut task_end_times: HashMap<i64, i64> = HashMap::new();
    let mut placements_out: Vec<Placement> = Vec::new();

    let mut pending = req.tasks;
    while !pending.is_empty() {
        let mut next_round = Vec::new();
        let mut progress = false;
        let mut pending_count: HashMap<i64, i32> = HashMap::new();
        for t in &pending {
            *pending_count.entry(t.id).or_insert(0) += 1;
        }

        let round = std::mem::take(&mut pending);
        for task in round {
            if let Some(dep) = task.depends_on_task_id {
                let ready = completed.get(&dep).copied().unwrap_or(false)
                    || (!pending_count.contains_key(&dep) && task_end_times.contains_key(&dep));
                if !ready && pending_count.get(&dep).copied().unwrap_or(0) > 0 {
                    next_round.push(task);
                    continue;
                }
                if !completed.get(&dep).copied().unwrap_or(false) && !task_end_times.contains_key(&dep) {
                    next_round.push(task);
                    continue;
                }
            }

            let mut start_after = task.start_after.as_ref().and_then(|s| parse_ts(s));
            if let Some(dep) = task.depends_on_task_id {
                if let Some(&dep_end) = task_end_times.get(&dep) {
                    start_after = Some(start_after.map(|s| s.max(dep_end)).unwrap_or(dep_end));
                }
            }

            let mut preset = task.preset_name.clone();
            if !available_by_preset.contains_key(&preset) {
                preset = "default".into();
            }

            let mut available = available_by_preset.get(&preset).cloned().unwrap_or_default();
            if task.auto_ignore {
                available = subtract_busy(&available, &external_busy);
            }
            let Some(due) = parse_ts(&task.due_date) else {
                next_round.push(task);
                continue;
            };
            available = trim_before_due(&available, due);
            if let Some(sa) = start_after {
                available = trim_after(&available, sa);
            }

            let mut duration = task.duration_minutes - task.locked_minutes;
            if duration <= 0 {
                *pending_count.entry(task.id).or_insert(1) -= 1;
                progress = true;
                continue;
            }

            let (next_avail, placed) = if !task.allow_splitting && start_after.is_some() {
                let start = start_after.unwrap();
                let end = start + (duration as i64) * 60;
                (available, vec![Iv { start, end }])
            } else {
                schedule_task(
                    available,
                    duration,
                    task.allow_splitting,
                    task.min_split_minutes,
                    task.buffer_before_minutes,
                    task.buffer_minutes,
                    &task.workload_mode,
                    due,
                    req.buffer_days,
                )
            };

            for pl in &placed {
                placements_out.push(Placement {
                    task_id: task.id,
                    start: fmt_ts(pl.start),
                    end: fmt_ts(pl.end),
                });
                let prev = task_end_times.get(&task.id).copied().unwrap_or(0);
                if pl.end > prev {
                    task_end_times.insert(task.id, pl.end);
                }
                let buf_start = pl.start - (task.buffer_before_minutes as i64) * 60;
                let buf_end = pl.end + (task.buffer_minutes as i64) * 60;
                // next_avail already accounts for placement via schedule_task; for fixed start re-apply
                let _ = buf_start;
                let _ = buf_end;
            }
            // Update availability: re-subtract buffers for fixed-start path
            let mut updated = next_avail;
            if !task.allow_splitting && start_after.is_some() {
                for pl in &placed {
                    let buf_start = pl.start - (task.buffer_before_minutes as i64) * 60;
                    let buf_end = pl.end + (task.buffer_minutes as i64) * 60;
                    updated = subtract_interval(&updated, buf_start, buf_end);
                }
            }
            available_by_preset.insert(preset, updated);
            *pending_count.entry(task.id).or_insert(1) -= 1;
            progress = true;
            let _ = duration;
        }

        if !progress {
            break;
        }
        if next_round.len() == pending_count.values().filter(|&&c| c > 0).count() && next_round.len() > 0 {
            // avoid infinite loop when nothing can proceed
            if next_round.len() == pending.len() {
                break;
            }
        }
        pending = next_round;
    }

    Ok(placements_out)
}

fn main() {
    let mut input = String::new();
    if let Err(e) = io::stdin().read_to_string(&mut input) {
        let _ = writeln!(
            io::stdout(),
            "{}",
            serde_json::to_string(&Response {
                placements: vec![],
                error: Some(e.to_string()),
            })
            .unwrap_or_default()
        );
        return;
    }

    let req: Request = match serde_json::from_str(&input) {
        Ok(r) => r,
        Err(e) => {
            let _ = writeln!(
                io::stdout(),
                "{}",
                serde_json::to_string(&Response {
                    placements: vec![],
                    error: Some(e.to_string()),
                })
                .unwrap_or_default()
            );
            return;
        }
    };

    let resp = match place(req) {
        Ok(placements) => Response {
            placements,
            error: None,
        },
        Err(e) => Response {
            placements: vec![],
            error: Some(e),
        },
    };
    let _ = writeln!(io::stdout(), "{}", serde_json::to_string(&resp).unwrap_or_default());
}
