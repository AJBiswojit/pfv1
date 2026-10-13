/**
 * PRATIKSHYA FASHION — Admin Attendance Devices
 *
 * Manage registered punching machines: list, register, rename (inline),
 * toggle active/inactive. Requires `attendance.manage` capability.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Monitor, Plus, Check, X, ToggleLeft, ToggleRight, Pencil } from "lucide-react";
import AdminPage from "../../../components/admin/AdminPage";
import AdminPanel from "../../../components/admin/AdminPanel";
import { useAdminAuth } from "../../../context/AdminAuthContext";
import {
  apiListAttendanceDevices,
  apiCreateAttendanceDevice,
  apiUpdateAttendanceDevice,
} from "../../../services/workforce/workforceApi";
import { cn } from "../../../utils/cn";

// ── Status badge ───────────────────────────────────────────────────────────

function ActiveBadge({ isActive }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 font-ui text-[11px]",
        isActive
          ? "bg-ink text-ivory"
          : "border border-mist bg-canvas-deep text-graphite"
      )}
    >
      {isActive ? (
        <><ToggleRight size={11} aria-hidden="true" /> Active</>
      ) : (
        <><ToggleLeft size={11} aria-hidden="true" /> Inactive</>
      )}
    </span>
  );
}

// ── Inline rename field ────────────────────────────────────────────────────

function InlineRename({ current, onSave, onCancel, busy }) {
  const [value, setValue] = useState(current);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== current) onSave(trimmed);
    else onCancel();
  };

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); commit(); }}
      className="flex items-center gap-2"
    >
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={busy}
        className="h-8 w-48 border border-accent bg-canvas px-2 font-ui text-xs text-ink outline-none focus:border-accent disabled:opacity-50"
        aria-label="Device label"
      />
      <button
        type="submit"
        disabled={busy || !value.trim()}
        className="flex h-8 w-8 items-center justify-center border border-mist bg-canvas text-brass hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Save label"
      >
        <Check size={13} />
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onCancel}
        className="flex h-8 w-8 items-center justify-center border border-mist bg-canvas text-taupe hover:border-ink hover:text-ink disabled:opacity-40"
        aria-label="Cancel rename"
      >
        <X size={13} />
      </button>
    </form>
  );
}

// ── Register form ──────────────────────────────────────────────────────────

function RegisterForm({ onRegistered, onCancel }) {
  const [serialNumber, setSerialNumber] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const serial = serialNumber.trim();
    const name = label.trim();
    if (!serial) { setError("Serial number is required."); return; }
    setBusy(true);
    setError(null);
    const result = await apiCreateAttendanceDevice({ serialNumber: serial, label: name || serial });
    setBusy(false);
    if (!result.ok) {
      setError(result.message ?? "Failed to register device.");
    } else {
      onRegistered(result.record);
    }
  };

  const fieldClass =
    "h-9 w-full border border-mist bg-canvas px-3 font-ui text-xs text-ink outline-none focus:border-accent disabled:opacity-50";

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6 border border-mist/80 bg-surface/40 p-5"
    >
      <p className="mb-4 font-ui text-[10px] uppercase tracking-[.18em] text-taupe">
        Register new device
      </p>
      <form onSubmit={handleSubmit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
            Serial number <span className="text-accent">*</span>
            <input
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              placeholder="e.g. ZK-X9000-001"
              disabled={busy}
              className={cn("mt-1.5", fieldClass)}
              required
            />
          </label>
          <label className="block font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
            Display label
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Ground floor entrance"
              disabled={busy}
              className={cn("mt-1.5", fieldClass)}
            />
          </label>
        </div>

        {error ? (
          <p role="alert" className="mt-3 font-ui text-[11px] text-accent">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex items-center gap-3">
          <button
            type="submit"
            disabled={busy || !serialNumber.trim()}
            className="border border-ink bg-ink px-4 py-2 font-ui text-[10px] uppercase tracking-[.14em] text-ivory hover:bg-ink/80 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Registering…" : "Register"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 font-ui text-[10px] uppercase tracking-[.14em] text-taupe hover:text-ink disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      </form>
    </motion.div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function AdminAttendanceDevices() {
  const { hasPermission } = useAdminAuth();
  const canManage = hasPermission("attendance.manage");

  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState(null);

  // Per-device busy state: deviceId → "toggle" | "rename" | null
  const [busyId, setBusyId] = useState(null);
  const [busyAction, setBusyAction] = useState(null);
  // Which device is currently being renamed
  const [renamingId, setRenamingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await apiListAttendanceDevices();
    setLoading(false);
    if (!result.ok) {
      setError(result.message ?? "Failed to load devices.");
    } else {
      setDevices(result.items ?? []);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const showNotice = (ok, text) => {
    setNotice({ ok, text });
    setTimeout(() => setNotice(null), 4000);
  };

  const handleRegistered = (record) => {
    setShowForm(false);
    setDevices((prev) => [record, ...prev]);
    showNotice(true, `Device "${record.label ?? record.serialNumber}" registered.`);
  };

  const handleToggle = async (device) => {
    if (busyId) return;
    setBusyId(device.id);
    setBusyAction("toggle");
    const result = await apiUpdateAttendanceDevice(device.id, { isActive: !device.isActive });
    setBusyId(null);
    setBusyAction(null);
    if (!result.ok) {
      showNotice(false, result.message ?? "Could not update device.");
    } else {
      setDevices((prev) =>
        prev.map((d) => (d.id === device.id ? { ...d, isActive: !d.isActive } : d))
      );
      showNotice(true, `Device "${device.label ?? device.serialNumber}" ${!device.isActive ? "activated" : "deactivated"}.`);
    }
  };

  const handleRename = async (device, newLabel) => {
    setBusyId(device.id);
    setBusyAction("rename");
    const result = await apiUpdateAttendanceDevice(device.id, { label: newLabel });
    setBusyId(null);
    setBusyAction(null);
    setRenamingId(null);
    if (!result.ok) {
      showNotice(false, result.message ?? "Could not rename device.");
    } else {
      setDevices((prev) =>
        prev.map((d) => (d.id === device.id ? { ...d, label: newLabel } : d))
      );
      showNotice(true, `Device renamed to "${newLabel}".`);
    }
  };

  const activeCount = devices.filter((d) => d.isActive).length;
  const inactiveCount = devices.length - activeCount;

  return (
    <AdminPage
      eyebrow="Workforce / Attendance"
      title={
        <>
          Punching <span className="italic text-accent">devices.</span>
        </>
      }
      description="Register and manage biometric / RFID punching machines. Toggle active status or rename any device."
      actions={
        canManage && !showForm ? (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 border border-ink bg-ink px-3 py-2 font-ui text-[10px] uppercase tracking-[.14em] text-ivory hover:bg-ink/80"
          >
            <Plus size={12} aria-hidden="true" /> Register device
          </button>
        ) : null
      }
    >
      {/* Notice */}
      {notice ? (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "mb-6 border px-4 py-3 font-ui text-sm",
            notice.ok
              ? "border-cocoa/30 bg-cocoa/5 text-cocoa"
              : "border-accent/40 bg-accent/5 text-accent"
          )}
        >
          {notice.text}
        </div>
      ) : null}

      {/* Loading / error */}
      {loading && devices.length === 0 ? (
        <p
          role="status"
          aria-live="polite"
          aria-busy="true"
          className="mb-6 border border-mist/80 bg-surface/40 px-4 py-3 font-ui text-[11px] text-taupe"
        >
          Loading devices…
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
      <section aria-label="Device summary" className="mb-7 grid gap-3 sm:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="border border-accent/40 bg-accent/5 p-4"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="font-ui text-[9px] uppercase tracking-[.18em] text-taupe">Total devices</p>
              <p className="mt-2 font-display text-2xl font-light text-ink">{devices.length}</p>
            </div>
            <Monitor size={16} className="text-accent" />
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
              <p className="font-ui text-[9px] uppercase tracking-[.18em] text-taupe">Active</p>
              <p className="mt-2 font-display text-2xl font-light text-ink">{activeCount}</p>
            </div>
            <ToggleRight size={16} className="text-brass" />
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
              <p className="font-ui text-[9px] uppercase tracking-[.18em] text-taupe">Inactive</p>
              <p className="mt-2 font-display text-2xl font-light text-ink">{inactiveCount}</p>
            </div>
            <ToggleLeft size={16} className="text-taupe" />
          </div>
        </motion.div>
      </section>

      {/* Register form */}
      {showForm ? (
        <RegisterForm
          onRegistered={handleRegistered}
          onCancel={() => setShowForm(false)}
        />
      ) : null}

      {/* Devices table */}
      <AdminPanel
        eyebrow={`${devices.length} device${devices.length !== 1 ? "s" : ""}`}
        title="Registered devices"
        bodyClassName="px-0 py-0 sm:px-0"
      >
        {/* Desktop table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left">
            <thead className="border-b border-mist/80 bg-canvas/80">
              <tr>
                {["Label", "Serial number", "Status", canManage ? "Actions" : ""].filter(Boolean).map((h) => (
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
              {devices.map((device) => {
                const isBeingRenamed = renamingId === device.id;
                const isBusy = busyId === device.id;

                return (
                  <tr
                    key={device.id}
                    className="border-b border-mist/50 last:border-0 hover:bg-surface/30"
                  >
                    <td className="px-4 py-3">
                      {isBeingRenamed && canManage ? (
                        <InlineRename
                          current={device.label ?? device.serialNumber}
                          busy={isBusy && busyAction === "rename"}
                          onSave={(newLabel) => handleRename(device, newLabel)}
                          onCancel={() => setRenamingId(null)}
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-ui text-sm text-ink">
                            {device.label ?? device.serialNumber}
                          </span>
                          {canManage ? (
                            <button
                              type="button"
                              onClick={() => setRenamingId(device.id)}
                              disabled={Boolean(busyId)}
                              className="text-taupe hover:text-brass disabled:cursor-not-allowed disabled:opacity-40"
                              aria-label={`Rename ${device.label ?? device.serialNumber}`}
                            >
                              <Pencil size={12} />
                            </button>
                          ) : null}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-taupe">
                      {device.serialNumber}
                    </td>
                    <td className="px-4 py-3">
                      <ActiveBadge isActive={device.isActive} />
                    </td>
                    {canManage ? (
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          disabled={Boolean(busyId)}
                          onClick={() => handleToggle(device)}
                          className="font-ui text-[12px] text-brass hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isBusy && busyAction === "toggle"
                            ? "Updating…"
                            : device.isActive
                              ? "Deactivate"
                              : "Activate"}
                        </button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {devices.length === 0 && !loading && !error ? (
            <p className="p-8 text-center font-ui text-sm text-taupe">
              No devices registered yet.{" "}
              {canManage ? (
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="text-brass hover:text-accent hover:underline"
                >
                  Register the first device.
                </button>
              ) : null}
            </p>
          ) : null}
        </div>

        {/* Mobile cards */}
        <div className="grid gap-3 p-3 md:hidden">
          {devices.map((device) => {
            const isBusy = busyId === device.id;
            const isBeingRenamed = renamingId === device.id;

            return (
              <div
                key={device.id}
                className="border border-mist/70 bg-canvas p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {isBeingRenamed && canManage ? (
                      <InlineRename
                        current={device.label ?? device.serialNumber}
                        busy={isBusy && busyAction === "rename"}
                        onSave={(newLabel) => handleRename(device, newLabel)}
                        onCancel={() => setRenamingId(null)}
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="font-ui text-sm text-ink truncate">
                          {device.label ?? device.serialNumber}
                        </p>
                        {canManage ? (
                          <button
                            type="button"
                            onClick={() => setRenamingId(device.id)}
                            disabled={Boolean(busyId)}
                            className="shrink-0 text-taupe hover:text-brass disabled:opacity-40"
                            aria-label="Rename"
                          >
                            <Pencil size={12} />
                          </button>
                        ) : null}
                      </div>
                    )}
                    <p className="mt-0.5 font-mono text-[11px] text-taupe">
                      {device.serialNumber}
                    </p>
                  </div>
                  <ActiveBadge isActive={device.isActive} />
                </div>
                {canManage ? (
                  <div className="mt-3 border-t border-mist/60 pt-3">
                    <button
                      type="button"
                      disabled={Boolean(busyId)}
                      onClick={() => handleToggle(device)}
                      className="font-ui text-[12px] text-brass hover:text-accent disabled:opacity-50"
                    >
                      {isBusy && busyAction === "toggle"
                        ? "Updating…"
                        : device.isActive
                          ? "Deactivate"
                          : "Activate"}
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}

          {devices.length === 0 && !loading && !error ? (
            <p className="py-6 text-center font-ui text-sm text-taupe">
              No devices registered yet.
            </p>
          ) : null}
        </div>
      </AdminPanel>
    </AdminPage>
  );
}
