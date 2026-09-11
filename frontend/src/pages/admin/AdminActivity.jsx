/**
 * DEFERRED ADMIN SURFACE (Admin consolidation 2026-09).
 *
 * audit_activity_log has READERS but ZERO backend writers (blocker B-09):
 * the page could only ever render an empty diary while implying a production
 * audit trail. It is no longer routed (/admin/activity redirects to the
 * dashboard). Restore it only when a backend audit writer pipeline exists:
 *   business action → backend audit writer → audit_activity_log → this page.
 */

import { useEffect, useState } from "react";
import AdminPage from "../../components/admin/AdminPage";
import ActivityFeed from "../../components/employee/ActivityFeed";
import { AtelierButton, EmptyState } from "../../design-system";
import { apiListAuditLogs } from "../../services/api/adminApi";

/**
 * /admin/activity
 *
 * The activity diary is backend-owned (GET /audit/logs, GET /admin/activity).
 * The feed renders server records; a failed fetch shows an explicit error
 * state — no local seeded diary.
 */
export default function AdminActivity() {
  const [entries, setEntries] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    apiListAuditLogs({ pageSize: 100 }).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setEntries(result.items ?? []);
        setError(null);
        setStatus("ready");
      } else {
        setError(result.error ?? "Could not load the activity log.");
        setStatus("error");
      }
    });
    return () => { cancelled = true; };
  }, [attempt]);

  return (
    <AdminPage
      eyebrow="System"
      title={<>Activity <span className="italic text-accent">log.</span></>}
      description="People, catalogue and workforce events recorded across both portals, read from the backend audit diary."
      actions={
        status === "error" ? (
          <AtelierButton size="chip" variant="outline" onClick={() => setAttempt((a) => a + 1)}>
            Retry
          </AtelierButton>
        ) : null
      }
    >
      {status === "loading" ? (
        <p role="status" className="font-ui text-sm text-taupe">Loading activity from the server…</p>
      ) : status === "error" ? (
        <EmptyState eyebrow="Diary unavailable" title="Activity log could not be loaded" description={error} />
      ) : (
        <>
          <ActivityFeed entries={entries} />
          <p className="mt-6 font-ui text-[11px] text-taupe">
            Read from the backend activity diary. Credentials are never written to it.
          </p>
        </>
      )}
    </AdminPage>
  );
}
