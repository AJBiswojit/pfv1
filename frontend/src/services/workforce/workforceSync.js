/**
 * PRATIKSHYA FASHON — Workforce hydration (server → session mirror).
 *
 * The repositories in this folder keep a SESSION-memory mirror; this module
 * is the single place that fills it from the backend. Rules:
 *
 *   • A successful fetch REPLACES the rows it owns (self rows for the month,
 *     plus the whole-day roster for people holding `attendance.view`, plus
 *     the reviewer queue for leave reviewers) and leaves unrelated mirror
 *     rows — e.g. a half-typed local review draft — untouched.
 *   • A FAILED fetch never clears existing data (the UI keeps showing what
 *     it had, with the error surfaced); an EMPTY 200 shows an honest empty
 *     state. There is no demo fallback anywhere in this file.
 */
import { ATTENDANCE_STORAGE_KEY, LEAVE_STORAGE_KEY } from "../../config/attendanceConfig";
import { PERFORMANCE_STORAGE_KEY } from "../../config/performanceConfig";
import { replaceList } from "./store";
import { normaliseAttendance, loadAttendance } from "./attendanceRepository";
import { normaliseLeave, loadLeave } from "./leaveRepository";
import { loadPerformance } from "./performanceRepository";
import {
  apiMyAttendanceMonth,
  apiAdminAttendanceDay,
  apiMyLeave,
  apiAdminLeave,
  apiMyPerformance,
} from "./workforceApi";

function todayKey() {
  // Store wall clock mirrors the backend's date bucketing (IST+30).
  return new Date(Date.now() + (5.5 * 60 + new Date().getTimezoneOffset()) * 60000)
    .toISOString()
    .slice(0, 10);
}

export function currentMonthKey() {
  return todayKey().slice(0, 7);
}

function mergeByKey(existing, incoming, keyOf, ownsExisting) {
  const kept = existing.filter((row) => !ownsExisting(row));
  const map = new Map(kept.map((row) => [keyOf(row), row]));
  for (const row of incoming) if (row) map.set(keyOf(row), row);
  return [...map.values()].sort((a, b) =>
    String(b.date ?? b.startDate ?? b.period ?? "").localeCompare(
      String(a.date ?? a.startDate ?? a.period ?? "")
    )
  );
}

export async function hydrateAttendance({ employeeCode, month = currentMonthKey(), withRoster = false }) {
  if (!employeeCode) return { ok: false, error: "No employee session" };
  const [mine, roster] = await Promise.all([
    apiMyAttendanceMonth(month),
    withRoster ? apiAdminAttendanceDay(todayKey()) : Promise.resolve({ ok: true, items: [] }),
  ]);
  if (!mine.ok) return { ok: false, error: mine.error };
  // A roster 403/409 never blocks the self list — it just means no team rows.
  const rosterItems = roster.ok ? roster.items : [];
  const incoming = [...(mine.items ?? []), ...rosterItems].map(normaliseAttendance).filter(Boolean);
  const ownsReplaced = (row) =>
    (row.employeeId === employeeCode && String(row.date).startsWith(month)) ||
    (withRoster && row.date === todayKey());
  const merged = mergeByKey(loadAttendance(), incoming, (r) => `${r.employeeId}#${r.date}`, ownsReplaced);
  replaceList(ATTENDANCE_STORAGE_KEY, merged);
  return { ok: true, count: merged.length, errors: roster.ok ? [] : [roster.error] };
}

export async function hydrateLeave({ employeeCode, reviewer = false }) {
  const tasks = [apiMyLeave()];
  if (reviewer) tasks.push(apiAdminLeave({ page: 1, pageSize: 100 }));
  const [mine, queue] = await Promise.all(tasks);
  if (!mine.ok && !reviewer) return { ok: false, error: mine.error };
  if (!mine.ok && queue && !queue.ok) return { ok: false, error: mine.error };
  const rows = [...(mine.items ?? []), ...((queue && queue.items) || [])].map(normaliseLeave).filter(Boolean);
  const seen = new Set();
  const deduped = rows.filter((row) => !seen.has(row.leaveId) && seen.add(row.leaveId));
  if (!reviewer) {
    const merged = mergeByKey(loadLeave(), deduped, (r) => r.leaveId, (row) => row.employeeId === employeeCode);
    replaceList(LEAVE_STORAGE_KEY, merged);
    return { ok: true, count: merged.length };
  }
  // Reviewers see the queue as truth: it already contains every request they
  // may act on (bounded at 100). Own unsubmitted drafts never exist server-
  // side, so a straight replace is honest.
  replaceList(LEAVE_STORAGE_KEY, deduped);
  return { ok: true, count: deduped.length };
}

export async function hydratePerformance({ employeeCode }) {
  if (!employeeCode) return { ok: false, error: "No employee session" };
  const res = await apiMyPerformance();
  if (!res.ok) return { ok: false, error: res.error };
  // Server rows are individual review records; group per employee+month so
  // the mirror's period-keyed rows stay stable, and map the review record's
  // comment onto the panel's managerFeedback field — nothing is invented:
  // score/status/targets stay untouched, they belong to other sources.
  const byPeriod = new Map();
  for (const row of res.reviews ?? []) {
    const period = String(row.reviewDate || "").slice(0, 7);
    if (!period) continue;
    const performanceId = `perf-${row.employeeId}-${period}`;
    const prior = byPeriod.get(performanceId);
    byPeriod.set(performanceId, {
      performanceId,
      employeeId: row.employeeId,
      employeeNameSnapshot: row.employeeName || row.employeeId,
      period,
      periodType: row.reviewPeriod || "MONTHLY",
      review: {
        managerFeedback: prior?.review?.managerFeedback
          ? `${prior.review.managerFeedback}\n\n${row.comments || ""}`.trim()
          : row.comments || "",
        reviewerName: row.reviewerName || null,
        reviewedAt: row.reviewDate || null,
      },
      updatedAt: row.reviewDate || new Date().toISOString(),
    });
  }
  const incoming = [...byPeriod.values()];
  const merged = mergeByKey(
    loadPerformance(),
    incoming,
    (r) => r.performanceId,
    (row) => row.employeeId === employeeCode && byPeriod.has(row.performanceId)
  );
  replaceList(PERFORMANCE_STORAGE_KEY, merged);
  return { ok: true, count: incoming.length, summary: res.summary };
}

export async function hydrateWorkforce({
  employeeCode,
  month = currentMonthKey(),
  withRoster = false,
  leaveReviewer = false,
}) {
  const results = await Promise.all([
    hydrateAttendance({ employeeCode, month, withRoster }),
    hydrateLeave({ employeeCode, reviewer: leaveReviewer }),
    hydratePerformance({ employeeCode }),
  ]);
  const errors = results.filter((r) => !r.ok).map((r) => r.error).filter(Boolean);
  return { ok: errors.length === 0, errors };
}

export default { hydrateAttendance, hydrateLeave, hydratePerformance, hydrateWorkforce, currentMonthKey };
