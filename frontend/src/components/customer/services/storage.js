/* Safe Web Storage helpers.
 * Every read/write is guarded: browsers can throw a SecurityError on mere *access* to
 * localStorage/sessionStorage (blocked third-party storage in embedded previews, privacy
 * modes, disabled cookies). Storage is a convenience here, so the site must never fail
 * to render because of it — callers get the fallback and the UI carries on in memory. */
const area = (kind) => {
  try { return kind === 'session' ? window.sessionStorage : window.localStorage; } catch { return null; }
};

export const load = (key, fallback, kind = 'local') => {
  try {
    const raw = area(kind)?.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};
export const save = (key, value, kind = 'local') => {
  try { area(kind)?.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
};
export const remove = (key, kind = 'local') => {
  try { area(kind)?.removeItem(key); } catch { /* storage unavailable */ }
};
