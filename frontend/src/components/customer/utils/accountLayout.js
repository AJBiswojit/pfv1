/** Presentation only: route ownership, guards and guest access stay unchanged. */
export function isAccountAreaPath(pathname) {
  return /^\/account(?:\/|$)/i.test(String(pathname ?? ''));
}
