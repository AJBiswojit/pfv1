/**
 * Workforce rules contract — frontend mirror ↔ backend authority.
 *
 * `backend/app/services/employee/workforce_rules.py` mirrors the semantics
 * the frontend applies for instant feedback. The two must never drift
 * silently: this test pins the shared literals and the timing/status
 * cascade the backend copies verbatim.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { ATTENDANCE_DEFAULTS, ATTENDANCE_STATUS } from "../src/config/attendanceConfig.js";
import { LEAVE_STATUS, LEAVE_TYPE } from "../src/config/attendanceConfig.js";
import {
  evaluateTiming,
  statusAfterPunch,
} from "../src/services/workforce/attendanceService.js";

// The backend pins the same numbers in workforce_rules.DEFAULT_SETTINGS.
test("attendance defaults are the documented house day", () => {
  assert.equal(ATTENDANCE_DEFAULTS.workingStartTime, "09:30");
  assert.equal(ATTENDANCE_DEFAULTS.workingEndTime, "18:30");
  assert.equal(ATTENDANCE_DEFAULTS.lateThresholdMinutes, 10);
  assert.equal(ATTENDANCE_DEFAULTS.minimumHalfDayMinutes, 240);
  assert.equal(ATTENDANCE_DEFAULTS.fullDayMinutes, 540);
});

test("leave vocabulary matches the server enumeration", () => {
  assert.deepEqual(
    [...Object.values(LEAVE_TYPE)].sort(),
    ["CASUAL", "EARNED", "EMERGENCY", "OTHER", "SICK"]
  );
  assert.deepEqual(
    [...Object.values(LEAVE_STATUS)].sort(),
    ["APPROVED", "CANCELLED", "PENDING", "REJECTED"]
  );
});

test("evaluateTiming counts lateness from opening, work from punches", () => {
  const settings = {
    ...ATTENDANCE_DEFAULTS,
    weekOffWeekdays: [],
    holidays: [],
  };
  const day = "2026-09-11";
  const late = evaluateTiming(day, `${day}T09:45:00`, `${day}T18:30:00`, settings);
  assert.equal(late.lateMinutes, 15);
  assert.equal(late.workMinutes, 525);
  assert.equal(late.earlyLeaveMinutes, 0);

  const onTime = evaluateTiming(day, `${day}T09:40:00`, `${day}T18:30:00`, settings);
  assert.equal(onTime.lateMinutes, 0);

  const early = evaluateTiming(day, `${day}T09:00:00`, `${day}T18:00:00`, settings);
  assert.equal(early.earlyLeaveMinutes, 30);
});

test("statusAfterPunch cascade matches the backend (leave → calendar → work)", () => {
  const settings = { ...ATTENDANCE_DEFAULTS, weekOffWeekdays: [], holidays: [] };
  const day = "2026-09-11";
  assert.equal(
    statusAfterPunch({ date: day, checkIn: null, checkOut: null, settings, onLeave: true }),
    ATTENDANCE_STATUS.LEAVE
  );
  assert.equal(
    statusAfterPunch({ date: day, checkIn: `${day}T09:45:00`, checkOut: `${day}T18:30:00`, settings }),
    ATTENDANCE_STATUS.LATE
  );
  assert.equal(
    statusAfterPunch({ date: day, checkIn: `${day}T09:00:00`, checkOut: `${day}T12:59:00`, settings }),
    ATTENDANCE_STATUS.HALF_DAY
  );
  assert.equal(
    statusAfterPunch({ date: day, checkIn: `${day}T09:00:00`, checkOut: `${day}T13:00:00`, settings }),
    ATTENDANCE_STATUS.PRESENT
  );
  // Holiday frame: a punch on it is ON_DUTY, no punch keeps the calendar label.
  const holidaySettings = { ...settings };
  assert.equal(
    statusAfterPunch({ date: day, checkIn: `${day}T12:00:00`, checkOut: null, settings: holidaySettings, calendar: { status: ATTENDANCE_STATUS.HOLIDAY } }),
    ATTENDANCE_STATUS.ON_DUTY
  );
});

test("loadAttendanceSettings is synchronous house defaults and never fetches admin settings", async () => {
  let fetches = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetches += 1;
    throw new Error("workforce settings must not call the network");
  };
  try {
    const { loadAttendanceSettings } = await import("../src/services/workforce/settings.js");
    const settings = loadAttendanceSettings();
    assert.equal(settings.workingStartTime, ATTENDANCE_DEFAULTS.workingStartTime);
    assert.equal(settings.workingEndTime, ATTENDANCE_DEFAULTS.workingEndTime);
    assert.equal(fetches, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("housePerformanceSummary does not throw when the team has no review records", async () => {
  const { replaceServerEmployees, getServerEmployees } = await import("../src/services/employees/employeeService.js");
  const { housePerformanceSummary } = await import("../src/services/workforce/performanceService.js");
  const previous = getServerEmployees();
  replaceServerEmployees([
    {
      id: "user-1",
      employeeId: "PFSE01",
      firstName: "Kiran",
      lastName: "Rao",
      role: "SALES_EXECUTIVE",
      status: "ACTIVE",
      department: "sales",
      store: "floor-1",
      accountLevel: "SUPER_EMPLOYEE",
    },
    {
      id: "user-2",
      employeeId: "PF0002",
      firstName: "Asha",
      lastName: "Patel",
      role: "SALES_EXECUTIVE",
      status: "ACTIVE",
      department: "sales",
      store: "floor-1",
    },
  ]);
  try {
    const actor = {
      employeeId: "PFSE01",
      status: "ACTIVE",
      accountLevel: "SUPER_EMPLOYEE",
      permissions: ["dashboard.view", "people.manage", "attendance.view"],
    };
    const summary = housePerformanceSummary(actor);
    assert.equal(typeof summary.total, "number");
    assert.equal(typeof summary.averageAchievement, "number");
    assert.ok(Array.isArray(summary.rows));
  } finally {
    replaceServerEmployees(previous);
  }
});
