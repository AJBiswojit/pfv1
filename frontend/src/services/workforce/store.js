/**
 * Shared persistence helpers for the workforce module.
 *
 * Workforce records (attendance, leave, performance, targets) are
 * server-owned. There is no localStorage register and no seed here: reads
 * return the in-memory session mirror (populated by backend fetches) and
 * writes only update that mirror + notify subscribers.
 */

import { WORKFORCE_CHANGED_EVENT } from "../../config/attendanceConfig";

let memory = new Map();

export const announceWorkforceChanged = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(WORKFORCE_CHANGED_EVENT));
  }
};

export const readList = (key) => {
  const stored = memory.get(key);
  return Array.isArray(stored) ? stored : null;
};

export const writeList = (key, list, { quiet = false } = {}) => {
  memory.set(key, Array.isArray(list) ? list : []);
  if (!quiet) announceWorkforceChanged();
};

/** Backend fetch populates the session mirror. */
export const replaceList = (key, list) => {
  memory.set(key, Array.isArray(list) ? list : []);
  announceWorkforceChanged();
};

export default {
  announceWorkforceChanged,
  readList,
  writeList,
  replaceList,
};
