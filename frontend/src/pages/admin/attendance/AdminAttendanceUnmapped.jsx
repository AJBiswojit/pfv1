/**
 * PRATIKSHYA FASHION — Admin Attendance Unmapped Pins
 *
 * Surface every unrecognised machine ID that has punched in but is not yet
 * linked to an employee. For each pin: punch count, first/last seen, and a
 * dropdown to pick the employee to link it to.
 * Requires `attendance.manage` capability.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Link2, AlertTriangle, Users, Check } from "lucide-react";
import AdminPage from "../../../components/admin/AdminPage";
import AdminPanel from "../../../components/admin/AdminPanel";
import { useEmployeeManagement } from "../../../context/EmployeeManagementContext";
import {
  apiListUnmappedPunches,
  apiMapDevicePin,
} from "../../../services/workforce/workforceApi";
import { formatDateShort, formatTime } from "../../../services/workforce/dateUtils";
import { employeeFullName } from "../../../utils/employee";
import { cn } from "../../../utils/cn";

// ── Row: a single unmapped pin ─────────────────────────────────────────────

function UnmappedRow({ pin, employees, onLinked }) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [linked, setLinked] = useState(false);

  const handleLink = async () => {
    if (!selectedEmployeeId || busy) return;
    setBusy(true);
    setError(null);
    const result = await apiMapDevicePin(selectedEmployeeId, pin.devicePin);
    setBusy(false);
    if (!result.ok) {
      setError(result.message ?? "Failed to link pin.");
    } else {
      setLinked(true);
      onLinked(pin.devicePin, selectedEmployeeId);
    }
  };

  if (linked) {
    return (
      <tr className="border-b border-mist/50 last:border-0 bg-cocoa/5">
        <td className="px-4 py-3 font-mono text-xs text-ink">{pin.devicePin}</td>
        <td colSpan={4} className="px-4 py-3">
          <span className="inline-flex items-center gap-1.5 font-ui text-[11px] text-cocoa">
            <Check size={12} aria-hidden="true" />
            Linked successfully
          </span>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-mist/50 last:border-0 hover:bg-surface/30">
      {/* Pin */}
      <td className="px-4 py-3 font-mono text-xs text-ink">{pin.devicePin}</td>

      {/* Punch count */}
      <td className="px-4 py-3 font-ui text-sm text-ink">{pin.punchCount ?? "—"}</td>

      {/* First seen */}
      <td className="px-4 py-3 font-ui text-[11px] text-taupe">
        {pin.firstSeen ? (
          <>
            <span className="block text-ink">{formatDateShort(pin.firstSeen)}</span>
            <span>{formatTime(pin.firstSeen)}</span>
          </>
        ) : "—"}
      </td>

      {/* Last seen */}
      <td className="px-4 py-3 font-ui text-[11px] text-taupe">
        {pin.lastSeen ? (
          <>
            <span className="block text-ink">{formatDateShort(pin.lastSeen)}</span>
            <span>{formatTime(pin.lastSeen)}</span>
          </>
        ) : "—"}
      </td>

      {/* Link action */}
      <td className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedEmployeeId}
            onChange={(e) => { setSelectedEmployeeId(e.target.value); setError(null); }}
            disabled={busy}
            className="h-9 min-w-[180px] border border-mist bg-canvas px-2 font-ui text-xs text-ink outline-none focus:border-accent disabled:opacity-50"
            aria-label={`Select employee for pin ${pin.devicePin}`}
          >
            <option value="">Pick employee…</option>
            {employees.map((emp) => (
              <option key={emp.employeeId ?? emp.id} value={emp.employeeId ?? emp.id}>
                {employeeFullName(emp)}
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={!selectedEmployeeId || busy}
            onClick={handleLink}
            className="inline-flex items-center gap-1.5 border border-ink bg-ink px-3 py-2 font-ui text-[10px] uppercase tracking-[.14em] text-ivory hover:bg-ink/80 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Link2 size={11} aria-hidden="true" />
            {busy ? "Linking…" : "Link"}
          </button>
        </div>
        {error ? (
          <p role="alert" className="mt-1.5 font-ui text-[11px] text-accent">{error}</p>
        ) : null}
      </td>
    </tr>
  );
}

// ── Mobile card variant ────────────────────────────────────────────────────

function UnmappedCard({ pin, employees, onLinked }) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [linked, setLinked] = useState(false);

  const handleLink = async () => {
    if (!selectedEmployeeId || busy) return;
    setBusy(true);
    setError(null);
    const result = await apiMapDevicePin(selectedEmployeeId, pin.devicePin);
    setBusy(false);
    if (!result.ok) {
      setError(result.message ?? "Failed to link pin.");
    } else {
      setLinked(true);
      onLinked(pin.devicePin, selectedEmployeeId);
    }
  };

  if (linked) {
    return (
      <div className="border border-cocoa/30 bg-cocoa/5 p-4">
        <div className="flex items-center gap-2 font-ui text-sm text-cocoa">
          <Check size={14} aria-hidden="true" />
          <span>Pin <span className="font-mono">{pin.devicePin}</span> linked successfully</span>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-mist/70 bg-canvas p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe">Device pin</p>
          <p className="mt-0.5 font-mono text-sm text-ink">{pin.devicePin}</p>
        </div>
        <div className="text-right">
          <p className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe">Punches</p>
          <p className="mt-0.5 font-display text-xl font-light text-ink">{pin.punchCount ?? "—"}</p>
        </div>
      </div>

      {/* Timestamps */}
      <div className="mt-3 grid grid-cols-2 gap-3 font-ui text-[11px]">
        <div>
          <p className="text-taupe">First seen</p>
          <p className="text-ink">{pin.firstSeen ? `${formatDateShort(pin.firstSeen)} ${formatTime(pin.firstSeen)}` : "—"}</p>
        </div>
        <div>
          <p className="text-taupe">Last seen</p>
          <p className="text-ink">{pin.lastSeen ? `${formatDateShort(pin.lastSeen)} ${formatTime(pin.lastSeen)}` : "—"}</p>
        </div>
      </div>

      {/* Link control */}
      <div className="mt-4 border-t border-mist/60 pt-4">
        <label className="block font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
          Link to employee
          <select
            value={selectedEmployeeId}
            onChange={(e) => { setSelectedEmployeeId(e.target.value); setError(null); }}
            disabled={busy}
            className="mt-1.5 h-9 w-full border border-mist bg-canvas px-2 font-ui text-xs text-ink outline-none focus:border-accent disabled:opacity-50"
          >
            <option value="">Pick employee…</option>
            {employees.map((emp) => (
              <option key={emp.employeeId ?? emp.id} value={emp.employeeId ?? emp.id}>
                {employeeFullName(emp)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!selectedEmployeeId || busy}
          onClick={handleLink}
          className="mt-2 inline-flex w-full items-center justify-center gap-1.5 border border-ink bg-ink py-2 font-ui text-[10px] uppercase tracking-[.14em] text-ivory hover:bg-ink/80 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Link2 size={11} aria-hidden="true" />
          {busy ? "Linking…" : "Link pin to employee"}
        </button>
        {error ? (
          <p role="alert" className="mt-1.5 font-ui text-[11px] text-accent">{error}</p>
        ) : null}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function AdminAttendanceUnmapped() {
  const { employees: allEmployees } = useEmployeeManagement();

  const [pins, setPins] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Track linked pins so they can be dismissed from the list
  const [linkedPins, setLinkedPins] = useState(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await apiListUnmappedPunches();
    setLoading(false);
    if (!result.ok) {
      setError(result.message ?? "Failed to load unmapped punches.");
    } else {
      setPins(result.items ?? []);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Only show employees who are active/accessible as link targets
  const employees = useMemo(
    () => (Array.isArray(allEmployees) ? allEmployees : []),
    [allEmployees]
  );

  const handleLinked = useCallback((devicePin) => {
    setLinkedPins((prev) => new Set([...prev, devicePin]));
  }, []);

  const activePins = pins.filter((p) => !linkedPins.has(p.devicePin));
  const resolvedCount = linkedPins.size;

  return (
    <AdminPage
      eyebrow="Workforce / Attendance"
      title={
        <>
          Unmapped <span className="italic text-accent">pins.</span>
        </>
      }
      description="Machine IDs that have recorded punches but are not yet linked to any employee. Link each pin to resolve it."
    >
      {/* Loading / error */}
      {loading && pins.length === 0 ? (
        <p
          role="status"
          aria-live="polite"
          aria-busy="true"
          className="mb-6 border border-mist/80 bg-surface/40 px-4 py-3 font-ui text-[11px] text-taupe"
        >
          Loading unmapped pins…
        </p>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="mb-6 border border-accent/30 bg-accent/5 px-4 py-3 font-ui text-[11px] text-accent"
        >
          {error}
          <button
            type="button"
            onClick={load}
            className="ml-2 uppercase tracking-[.14em] underline-offset-2 hover:underline"
          >
            Retry
          </button>
        </div>
      ) : null}

      {/* Summary tiles */}
      <section aria-label="Unmapped pins summary" className="mb-7 grid gap-3 sm:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="border border-accent/40 bg-accent/5 p-4"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="font-ui text-[9px] uppercase tracking-[.18em] text-taupe">Unresolved</p>
              <p className="mt-2 font-display text-2xl font-light text-ink">{activePins.length}</p>
            </div>
            <AlertTriangle size={16} className="text-accent" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="border border-mist/80 bg-surface/40 p-4"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="font-ui text-[9px] uppercase tracking-[.18em] text-taupe">Linked this session</p>
              <p className="mt-2 font-display text-2xl font-light text-ink">{resolvedCount}</p>
            </div>
            <Link2 size={16} className="text-brass" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="border border-mist/80 bg-surface/40 p-4"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="font-ui text-[9px] uppercase tracking-[.18em] text-taupe">Employees available</p>
              <p className="mt-2 font-display text-2xl font-light text-ink">{employees.length}</p>
            </div>
            <Users size={16} className="text-taupe" />
          </div>
        </motion.div>
      </section>

      {/* Table */}
      <AdminPanel
        eyebrow={`${activePins.length} unresolved pin${activePins.length !== 1 ? "s" : ""}`}
        title="Unmapped device pins"
        bodyClassName="px-0 py-0 sm:px-0"
      >
        {/* Desktop table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left">
            <thead className="border-b border-mist/80 bg-canvas/80">
              <tr>
                {["Device pin", "Punch count", "First seen", "Last seen", "Link to employee"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 font-ui text-[10px] uppercase tracking-[.16em] text-taupe"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activePins.map((pin) => (
                <UnmappedRow
                  key={pin.devicePin}
                  pin={pin}
                  employees={employees}
                  onLinked={handleLinked}
                />
              ))}

              {/* Linked rows shown as confirmation */}
              {[...linkedPins].map((devicePin) => (
                <tr key={`linked-${devicePin}`} className="border-b border-mist/50 last:border-0 bg-cocoa/5">
                  <td className="px-4 py-3 font-mono text-xs text-ink">{devicePin}</td>
                  <td colSpan={4} className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 font-ui text-[11px] text-cocoa">
                      <Check size={12} aria-hidden="true" />
                      Linked successfully
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {activePins.length === 0 && resolvedCount === 0 && !loading && !error ? (
            <p className="p-8 text-center font-ui text-sm text-taupe">
              No unmapped pins — all device IDs are linked to employees.
            </p>
          ) : null}

          {activePins.length === 0 && resolvedCount > 0 && !loading ? (
            <p className="p-8 text-center font-ui text-sm text-cocoa">
              All {resolvedCount} pin{resolvedCount !== 1 ? "s" : ""} linked this session.
            </p>
          ) : null}
        </div>

        {/* Mobile cards */}
        <div className="grid gap-3 p-3 md:hidden">
          {activePins.map((pin) => (
            <UnmappedCard
              key={pin.devicePin}
              pin={pin}
              employees={employees}
              onLinked={handleLinked}
            />
          ))}

          {[...linkedPins].map((devicePin) => (
            <div key={`linked-${devicePin}`} className="border border-cocoa/30 bg-cocoa/5 p-4">
              <div className="flex items-center gap-2 font-ui text-sm text-cocoa">
                <Check size={14} aria-hidden="true" />
                <span>Pin <span className="font-mono">{devicePin}</span> linked</span>
              </div>
            </div>
          ))}

          {activePins.length === 0 && resolvedCount === 0 && !loading && !error ? (
            <p className="py-6 text-center font-ui text-sm text-taupe">
              No unmapped pins found.
            </p>
          ) : null}
        </div>
      </AdminPanel>
    </AdminPage>
  );
}
