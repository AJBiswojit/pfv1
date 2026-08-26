/**
 * Workforce bootstrap — no seeding.
 *
 * Attendance, leave, performance and targets are server-owned. The stores
 * start empty; backend fetches populate the session mirror. There must
 * never be demo workforce records.
 */
export const ensureWorkforceSeeded = () => undefined;
export default { ensureWorkforceSeeded };
