/**
 * PRATIKSHYA FASHON — Optional style preferences (Phase 19).
 *
 * Isolated namespace. Customer-scoped. Never invents taste.
 *
 * BACKEND_GAP (Phase 4 classification, audit §9.2/§23): the backend has no
 * style-preferences contract, so this store is intentionally client-side
 * (device-local, customer-scoped) — the same classification as the guest
 * cart. It is NOT silently presented as server data: the preferences page
 * says the notes are saved to this device. If/when a backend contract is
 * added, `saveStylePreferences`/`getStylePreferences` are the single seam
 * to swap for API calls.
 */

import { readStorage, writeStorage } from "../../utils/shopping";

export const STYLE_PREFERENCES_STORAGE_KEY = "pratikshya_preferences";
export const STYLE_PREFERENCES_CHANGED_EVENT = "pratikshya-preferences-changed";

const DEFAULT = {
  categories: [],
  fabrics: [],
  occasions: [],
  colours: [],
};

const emptyStore = () => ({ version: 1, scopes: {} });

const announce = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(STYLE_PREFERENCES_CHANGED_EVENT));
  }
};

const readStore = () => {
  const stored = readStorage(STYLE_PREFERENCES_STORAGE_KEY, null);
  if (!stored || typeof stored !== "object" || !stored.scopes || typeof stored.scopes !== "object") {
    return emptyStore();
  }
  return { version: 1, scopes: stored.scopes };
};

const sanitise = (raw) => {
  if (!raw || typeof raw !== "object") return { ...DEFAULT };
  const list = (value) =>
    Array.isArray(value) ? [...new Set(value.map((entry) => String(entry).trim()).filter(Boolean))] : [];
  return {
    categories: list(raw.categories),
    fabrics: list(raw.fabrics),
    occasions: list(raw.occasions),
    colours: list(raw.colours),
  };
};

export const getStylePreferences = (customerId) => {
  if (!customerId) return { ...DEFAULT };
  const store = readStore();
  return sanitise(store.scopes[String(customerId)]);
};

export const saveStylePreferences = (customerId, next) => {
  if (!customerId) return { ...DEFAULT };
  const store = readStore();
  const cleaned = sanitise(next);
  store.scopes[String(customerId)] = cleaned;
  writeStorage(STYLE_PREFERENCES_STORAGE_KEY, store);
  announce();
  return cleaned;
};

export const hasStylePreferences = (prefs) => {
  if (!prefs) return false;
  return ["categories", "fabrics", "occasions", "colours"].some(
    (key) => Array.isArray(prefs[key]) && prefs[key].length > 0
  );
};

export default { getStylePreferences, saveStylePreferences, hasStylePreferences };
