/* F-07 + F-08 (Batch 3): slot occupancy, stated in one place.
 *
 * The editor already prints "(1/1 filled)" inside the <option>; that text is
 * truncated by narrow selects. This meter repeats the same authoritative
 * numbers beside the control, and it is the only place the "full" sentence is
 * composed, so the form and the option list cannot drift.
 */

export const slotCapacityText = (used, capacity) => {
  const total = Math.max(0, Number(capacity) || 0);
  const taken = Math.max(0, Number(used) || 0);
  if (!total) return 'No capacity is registered for this slot.';
  const places = total - taken;
  if (places <= 0) return `${taken} of ${total} — full`;
  return `${taken} of ${total} used · ${places} place${places === 1 ? '' : 's'} left`;
};

export default function SlotMeter({ slotKey, used = 0, capacity = 0, label = '' }) {
  const full = Number(capacity) > 0 && Number(used) >= Number(capacity);
  return <p className="text-xs" role="status" data-slot-meter>
    <span className="uppercase tracking-[.12em] text-pf-muted">{label || slotKey}</span>
    {' · '}
    <span className={full ? 'text-pf-error' : ''}>{slotCapacityText(used, capacity)}</span>
  </p>;
}
