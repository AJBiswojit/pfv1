import { useState } from "react";
import { ImagePlay, KeyRound, UploadCloud } from "lucide-react";
import AdminPanel from "../AdminPanel";
import { AtelierButton } from "../../../design-system";
import { apiRegisterPlacementAsset, apiUploadMediaObject } from "../../../services/api/mediaApi";

/* Placement art registration (hero/marketing). Homepage hero slides and
   homepage section MEDIA slots reference *registered* assets, and only the
   hero/ and marketing/ object namespaces are eligible for placement
   registration. This panel is the ONE admin surface that pairs the two
   explicit steps — upload the object, then register it — plus a
   register-by-key form for objects that already sit in storage (for example
   seed art copied by the media migration). Uploading is never an implicit
   registration of arbitrary objects elsewhere in the system. */

const PLACEMENT_NAMESPACES = [
  { id: "hero", label: "Hero (hero/)" },
  { id: "marketing", label: "Marketing (marketing/)" },
];

const ACCEPTED_IMAGES = "image/jpeg,image/png,image/webp,image/avif";

const idle = { kind: "idle", text: "" };

export default function PlacementAssetPanel({ onRegistered }) {
  const [namespace, setNamespace] = useState("hero");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(idle);
  const [objectKey, setObjectKey] = useState("");

  const describe = (media, created, prefix) =>
    `${prefix} ${media?.objectKey || "object"} — ${created ? "newly registered" : "already registered (no duplicate created)"}. It is now visible to the homepage media pickers.`;

  const handleUploadAndRegister = async () => {
    if (!file) {
      setFeedback({ kind: "error", text: "Choose an image file first (JPEG, PNG, WebP or AVIF)." });
      return;
    }
    setBusy(true);
    setFeedback(idle);
    const uploaded = await apiUploadMediaObject(file, { namespace });
    if (!uploaded?.ok || !uploaded.object?.key) {
      setBusy(false);
      setFeedback({ kind: "error", text: uploaded?.error || "Upload failed — the object was not stored, nothing was registered." });
      return;
    }
    const registered = await apiRegisterPlacementAsset(uploaded.object.key);
    setBusy(false);
    if (!registered?.ok) {
      setFeedback({
        kind: "error",
        text: `Uploaded to ${uploaded.object.key}, but registration failed: ${registered.error || "unknown error"}. Register it below with the object key once the issue is fixed.`,
      });
      setObjectKey(uploaded.object.key);
      return;
    }
    setFeedback({ kind: "ok", text: describe(registered.media, registered.created, "Uploaded and registered") });
    setFile(null);
    onRegistered?.();
  };

  const handleRegisterExisting = async () => {
    const key = objectKey.trim();
    if (!key) {
      setFeedback({ kind: "error", text: "Enter the full object key, e.g. hero/hero001.avif or marketing/campaign.avif." });
      return;
    }
    setBusy(true);
    setFeedback(idle);
    const registered = await apiRegisterPlacementAsset(key);
    setBusy(false);
    if (!registered?.ok) {
      setFeedback({ kind: "error", text: registered.error || "Registration failed." });
      return;
    }
    setFeedback({ kind: "ok", text: describe(registered.media, registered.created, "Registered") });
    setObjectKey("");
    onRegistered?.();
  };

  return (
    <AdminPanel
      title={
        <span className="inline-flex items-center gap-2">
          <ImagePlay size={14} className="text-pf-burgundy" /> Homepage placement art
        </span>
      }
      description="Register hero/ and marketing/ images so they can be used by the homepage hero and each homepage section's MEDIA slots. Registration is explicit: upload then register, or register an object that is already in storage."
      className="mb-6"
    >
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Upload AND register in one action */}
        <div className="rounded-xl border border-pf-burgundy-faint bg-shell px-4 py-3.5">
          <p className="flex items-center gap-2 text-sm font-semibold text-charcoal">
            <UploadCloud size={14} className="text-charcoal/50" /> Upload and register
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              value={namespace}
              onChange={(event) => setNamespace(event.target.value)}
              className="rounded-lg border border-pf-burgundy-faint bg-white px-2.5 py-2 text-xs text-charcoal"
              aria-label="Placement namespace"
            >
              {PLACEMENT_NAMESPACES.map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.label}</option>
              ))}
            </select>
            <input
              type="file"
              accept={ACCEPTED_IMAGES}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="max-w-[16rem] text-xs text-charcoal/70 file:mr-2 file:rounded-lg file:border-0 file:bg-pf-burgundy/10 file:px-3 file:py-2 file:text-xs file:text-charcoal"
              aria-label="Placement image file"
            />
            <AtelierButton size="chip" onClick={handleUploadAndRegister} disabled={busy}>
              {busy ? "Working…" : "Upload and register"}
            </AtelierButton>
            {file ? <span className="text-[11px] text-charcoal/60">{file.name}</span> : null}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-charcoal/50">
            Only JPEG/PNG/WebP/AVIF, max 10 MB, content is verified server-side. The object is stored under the
            selected namespace and registered in the same action — no auto-registration happens anywhere else.
          </p>
        </div>

        {/* Register an object that is already in storage */}
        <div className="rounded-xl border border-pf-burgundy-faint bg-shell px-4 py-3.5">
          <p className="flex items-center gap-2 text-sm font-semibold text-charcoal">
            <KeyRound size={14} className="text-charcoal/50" /> Register existing object
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={objectKey}
              onChange={(event) => setObjectKey(event.target.value)}
              placeholder="hero/hero006.avif"
              className="min-w-0 flex-1 rounded-lg border border-pf-burgundy-faint bg-white px-3 py-2 text-xs text-charcoal"
              aria-label="Existing object key"
            />
            <AtelierButton size="chip" variant="outline" onClick={handleRegisterExisting} disabled={busy}>
              {busy ? "Working…" : "Register"}
            </AtelierButton>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-charcoal/50">
            For art already in storage (e.g. seed hero files). Only hero/ and marketing/ keys are accepted; the file
            must exist and validate as an image. Duplicate registration is a no-op.
          </p>
        </div>
      </div>

      {feedback.kind !== "idle" ? (
        <p
          role={feedback.kind === "error" ? "alert" : "status"}
          className={
            feedback.kind === "error"
              ? "mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-900"
              : "mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-900"
          }
        >
          {feedback.text}
        </p>
      ) : null}
    </AdminPanel>
  );
}
