/**
 * PRATIKSHYA FASHON — Attendance settings (demo working hours + calendar).
 *
 * Synchronous house defaults for workforce timing math. Live admin settings
 * stay on the Admin Settings page; they are admin-token scoped and must not
 * run during an employee-portal render. Super Employee sessions have no admin
 * JWT — a render-time fetch 401'd and raced the dashboard unmount.
 */

import { ATTENDANCE_DEFAULTS, HOUSE_HOLIDAYS } from "../../config/attendanceConfig";

const normaliseSettings = (raw) => {
  const source = raw && typeof raw === "object" ? raw : {};
  const weekOff = Array.isArray(source.weekOffWeekdays)
    ? source.weekOffWeekdays.map((day) => Number(day)).filter((day) => day >= 0 && day <= 6)
    : ATTENDANCE_DEFAULTS.weekOffWeekdays;
  const holidays = Array.isArray(source.holidays) && source.holidays.length
    ? source.holidays
        .filter((item) => item && /^\d{4}-\d{2}-\d{2}$/.test(item.date))
        .map((item) => ({ date: item.date, name: String(item.name || "Holiday") }))
    : HOUSE_HOLIDAYS;

  return {
    workingStartTime: source.workingStartTime || ATTENDANCE_DEFAULTS.workingStartTime,
    workingEndTime: source.workingEndTime || ATTENDANCE_DEFAULTS.workingEndTime,
    lateThresholdMinutes: Math.max(0, Number(source.lateThresholdMinutes) || ATTENDANCE_DEFAULTS.lateThresholdMinutes),
    minimumHalfDayMinutes: Math.max(0, Number(source.minimumHalfDayMinutes) || ATTENDANCE_DEFAULTS.minimumHalfDayMinutes),
    fullDayMinutes: Math.max(1, Number(source.fullDayMinutes) || ATTENDANCE_DEFAULTS.fullDayMinutes),
    weekOffWeekdays: weekOff.length ? weekOff : ATTENDANCE_DEFAULTS.weekOffWeekdays,
    holidays,
  };
};

export const loadAttendanceSettings = () =>
  normaliseSettings({ ...ATTENDANCE_DEFAULTS, holidays: HOUSE_HOLIDAYS });

export const saveAttendanceSettings = (patch = {}) =>
  normaliseSettings({ ...loadAttendanceSettings(), ...patch });

export default {
  loadAttendanceSettings,
  saveAttendanceSettings,
};
